import type { FileSystemAdapter } from '@/lib/fs/types'
import type { RemoteSyncProvider, RemoteFileEntry, SyncManifestEntry, SyncStatus } from './types'
import { SyncState } from './sync-state'
import { detectLocalChanges, hashBytes } from './change-detector'
import { buildSyncExcludeMatcher } from './excludes'
import { resolveSyncConflict, decideRemoteUpdate, decideRemoteDelete } from './conflicts'

export type SyncStatusListener = (status: SyncStatus, message?: string) => void

/** A true conflict: both sides changed and one side's edits were discarded. */
export interface SyncConflict {
  path: string
  winner: 'local' | 'remote'
}

export type SyncConflictListener = (conflict: SyncConflict) => void

export class SyncManager {
  private state: SyncState
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private listeners = new Set<SyncStatusListener>()
  private conflictListeners = new Set<SyncConflictListener>()
  /** Paths already announced this fullSync — the push and pull loops can
   *  both evaluate the same conflicting path; the user hears about it once. */
  private announcedConflicts = new Set<string>()
  private _status: SyncStatus = 'idle'
  /**
   * Excluded paths are invisible to sync in BOTH directions: skipped by
   * the local scan and the push path, ignored in remote listings/deltas,
   * and their stale manifest rows are purged without a remote delete.
   */
  private isExcluded: (path: string) => boolean

  constructor(
    private provider: RemoteSyncProvider,
    private fs: FileSystemAdapter,
    private vaultId: string,
    private pollIntervalMs: number = 30_000,
    excludePaths?: string[],
  ) {
    this.state = new SyncState(vaultId)
    this.isExcluded = buildSyncExcludeMatcher(excludePaths)
  }

  get status(): SyncStatus {
    return this._status
  }

  onStatusChange(listener: SyncStatusListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Notified once per file per sync run when a TRUE conflict resolves. */
  onConflict(listener: SyncConflictListener): () => void {
    this.conflictListeners.add(listener)
    return () => this.conflictListeners.delete(listener)
  }

  private setStatus(status: SyncStatus, message?: string) {
    this._status = status
    for (const fn of this.listeners) fn(status, message)
  }

  // --------------- Full sync (vault open) ---------------

  async fullSync(): Promise<void> {
    this.setStatus('syncing', 'Starting full sync…')
    this.announcedConflicts.clear()
    try {
      await this.provider.prepareRemoteRoot?.()

      const localChanges = await detectLocalChanges(this.fs, this.state, this.isExcluded)
      const manifestMap = new Map<string, SyncManifestEntry>()
      for (const e of await this.state.getAllEntries()) {
        // Purge stale rows for excluded paths (e.g. snapshots synced
        // before excludes existed) WITHOUT touching the remote copy.
        if (this.isExcluded(e.path)) {
          await this.state.removeEntry(e.path)
          continue
        }
        manifestMap.set(e.path, e)
      }

      // Collect all remote files (excluded paths stay invisible)
      const remoteMap = new Map<string, RemoteFileEntry>()
      let result = await this.provider.listFiles()
      for (const e of result.entries) {
        if (!e.isDirectory && !this.isExcluded(e.path)) remoteMap.set(e.path, e)
      }
      while (result.hasMore && result.cursor) {
        result = await this.provider.listFiles(result.cursor)
        for (const e of result.entries) {
          if (!e.isDirectory && !this.isExcluded(e.path)) remoteMap.set(e.path, e)
        }
      }
      if (result.cursor) {
        await this.state.setCursor(result.cursor)
      }

      // Push local creates and modifications
      for (const path of [...localChanges.created, ...localChanges.modified]) {
        const remote = remoteMap.get(path)
        if (remote) {
          const winner = this.resolveConflict(path, localChanges, remote, manifestMap.get(path))
          if (winner === 'remote') {
            await this.pullFile(path, remote)
            continue
          }
        }
        await this.pushFileInternal(path)
      }

      // Pull remote files that are new or newer
      for (const [path, remote] of remoteMap) {
        if (remote.isDirectory) continue
        const manifestEntry = manifestMap.get(path)

        if (!manifestEntry) {
          // New remote file — pull
          await this.pullFile(path, remote)
        } else if (manifestEntry.remoteHash !== remote.hash) {
          // Remote changed since last sync
          const isLocallyChanged =
            localChanges.modified.includes(path) || localChanges.created.includes(path)
          if (isLocallyChanged) {
            const winner = this.resolveConflict(path, localChanges, remote, manifestEntry)
            if (winner === 'remote') {
              await this.pullFile(path, remote)
            }
            // if local wins, it was already pushed above
          } else {
            await this.pullFile(path, remote)
          }
        }
      }

      // Handle local deletes: remove from remote
      for (const path of localChanges.deleted) {
        const remote = remoteMap.get(path)
        if (remote) {
          try {
            await this.provider.remove(path)
          } catch {
            // file may already be gone
          }
        }
        await this.state.removeEntry(path)
      }

      // Handle remote deletes: files in manifest but not in remote
      for (const entry of manifestMap.values()) {
        if (!remoteMap.has(entry.path)) {
          const exists = await this.fs.exists(entry.path)
          if (exists) {
            const isLocallyModified =
              localChanges.modified.includes(entry.path) ||
              localChanges.created.includes(entry.path)
            if (isLocallyModified) {
              // Re-upload: local edit wins over remote delete
              await this.pushFileInternal(entry.path)
            } else {
              try {
                await this.fs.remove(entry.path)
              } catch {
                // already gone
              }
              await this.state.removeEntry(entry.path)
            }
          } else {
            await this.state.removeEntry(entry.path)
          }
        }
      }

      await this.state.setLastSyncTimestamp(new Date().toISOString())
      this.setStatus('idle')
    } catch (err) {
      this.setStatus('error', err instanceof Error ? err.message : String(err))
      throw err
    }
  }

  // --------------- Push single file (after save) ---------------

  async pushFile(path: string): Promise<void> {
    if (this.isExcluded(path)) return
    this.setStatus('syncing', `Pushing ${path}…`)
    try {
      await this.pushFileInternal(path)
      this.setStatus('idle')
    } catch (err) {
      this.setStatus('error', err instanceof Error ? err.message : String(err))
      throw err
    }
  }

  private async pushFileInternal(path: string): Promise<void> {
    const data = await this.fs.readFile(path)
    const localHash = await hashBytes(data)

    // Ensure parent directories exist
    const parts = path.split('/')
    if (parts.length > 1) {
      let dir = ''
      for (let i = 0; i < parts.length - 1; i++) {
        dir = dir ? `${dir}/${parts[i]}` : parts[i]
        try {
          await this.provider.mkdir(dir)
        } catch {
          // directory may already exist
        }
      }
    }

    const remote = await this.provider.upload(path, data)
    await this.state.setEntry({
      path,
      localHash,
      remoteHash: remote.hash,
      lastSyncedAt: new Date().toISOString(),
    })
  }

  // --------------- Pull remote changes (periodic) ---------------

  async pull(): Promise<void> {
    this.setStatus('syncing', 'Pulling remote changes…')
    this.announcedConflicts.clear()
    try {
      const cursor = await this.state.getCursor()

      if (cursor && this.provider.type === 'dropbox') {
        let changes = await this.provider.listChanges(cursor)
        await this.applyRemoteChanges(changes.entries, changes.deleted)
        await this.state.setCursor(changes.cursor)

        while (changes.hasMore) {
          changes = await this.provider.listChanges(changes.cursor)
          await this.applyRemoteChanges(changes.entries, changes.deleted)
          await this.state.setCursor(changes.cursor)
        }
      } else {
        // Fallback: full listing comparison (no delta cursor yet)
        await this.fullSync()
        return
      }

      await this.state.setLastSyncTimestamp(new Date().toISOString())
      this.setStatus('idle')
    } catch (err) {
      this.setStatus('error', err instanceof Error ? err.message : String(err))
      throw err
    }
  }

  private async applyRemoteChanges(entries: RemoteFileEntry[], deleted: string[]): Promise<void> {
    for (const remote of entries) {
      if (remote.isDirectory || this.isExcluded(remote.path)) continue
      const manifestEntry = await this.state.getEntry(remote.path)

      const decision = decideRemoteUpdate({
        manifestEntry,
        localHash: await this.currentLocalHash(remote.path),
        remoteHash: remote.hash,
        remoteModifiedAt: remote.modifiedAt,
      })

      if (decision.isTrueConflict) {
        this.announceConflict(remote.path, decision.action === 'pull' ? 'remote' : 'local')
      }

      if (decision.action === 'pull') {
        await this.pullFile(remote.path, remote)
      } else if (decision.action === 'push-local') {
        // Unpushed local edit (or same-path local create) wins — re-assert
        // it instead of clobbering. The upload also realigns the manifest.
        await this.pushFileInternal(remote.path)
      }
    }

    for (const path of deleted) {
      if (this.isExcluded(path)) continue
      const manifestEntry = await this.state.getEntry(path)
      const localExists = await this.fs.exists(path)
      const action = decideRemoteDelete({
        manifestEntry,
        localExists,
        localHash: localExists ? await this.currentLocalHash(path) : null,
      })

      if (action === 'push-local') {
        // Local edit wins over remote delete (full sync's re-upload rule).
        await this.pushFileInternal(path)
        continue
      }
      if (action === 'keep-local') continue
      if (action === 'delete-local') {
        try {
          await this.fs.remove(path)
        } catch {
          // already gone
        }
      }
      await this.state.removeEntry(path)
    }
  }

  /** SHA-256 of the local file's current bytes; null when missing/unreadable. */
  private async currentLocalHash(path: string): Promise<string | null> {
    try {
      return await hashBytes(await this.fs.readFile(path))
    } catch {
      return null
    }
  }

  private announceConflict(path: string, winner: 'local' | 'remote'): void {
    if (this.announcedConflicts.has(path)) return
    this.announcedConflicts.add(path)
    for (const fn of this.conflictListeners) fn({ path, winner })
  }

  private async pullFile(path: string, remote: RemoteFileEntry): Promise<void> {
    const data = await this.provider.download(path)
    const localHash = await hashBytes(data)

    // Ensure parent directories exist locally
    const parts = path.split('/')
    if (parts.length > 1) {
      let dir = ''
      for (let i = 0; i < parts.length - 1; i++) {
        dir = dir ? `${dir}/${parts[i]}` : parts[i]
        const dirExists = await this.fs.exists(dir)
        if (!dirExists) {
          await this.fs.mkdir(dir)
        }
      }
    }

    await this.fs.writeFile(path, data)
    await this.state.setEntry({
      path,
      localHash,
      remoteHash: remote.hash,
      lastSyncedAt: new Date().toISOString(),
    })
  }

  // --------------- Conflict resolution ---------------

  private resolveConflict(
    path: string,
    localChanges: { created: string[]; modified: string[] },
    remote: RemoteFileEntry,
    manifestEntry: SyncManifestEntry | undefined,
  ): 'local' | 'remote' {
    const decision = resolveSyncConflict({
      isLocallyChanged:
        localChanges.modified.includes(path) || localChanges.created.includes(path),
      remoteHash: remote.hash,
      remoteModifiedAt: remote.modifiedAt,
      manifestEntry,
    })

    // Surface TRUE conflicts (both sides changed → one side discarded).
    if (decision.isTrueConflict) this.announceConflict(path, decision.winner)

    return decision.winner
  }

  // --------------- Polling ---------------

  startPolling(): void {
    this.stopPolling()
    this.pollTimer = setInterval(() => {
      this.pull().catch(() => {
        // error already set via setStatus
      })
    }, this.pollIntervalMs)
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  async disconnect(): Promise<void> {
    this.stopPolling()
    await this.state.clear()
  }
}
