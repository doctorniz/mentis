import type { FileSystemAdapter } from '@/lib/fs/types'
import type {
  RemoteSyncProvider,
  RemoteFileEntry,
  SyncManifestEntry,
  SyncStatus,
} from './types'
import { SyncState } from './sync-state'
import { detectLocalChanges, hashBytes } from './change-detector'

export type SyncStatusListener = (status: SyncStatus, message?: string) => void

export class SyncManager {
  private state: SyncState
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private listeners = new Set<SyncStatusListener>()
  private _status: SyncStatus = 'idle'

  constructor(
    private provider: RemoteSyncProvider,
    private fs: FileSystemAdapter,
    private vaultId: string,
    private pollIntervalMs: number = 30_000,
  ) {
    this.state = new SyncState(vaultId)
  }

  get status(): SyncStatus {
    return this._status
  }

  onStatusChange(listener: SyncStatusListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private setStatus(status: SyncStatus, message?: string) {
    this._status = status
    for (const fn of this.listeners) fn(status, message)
  }

  // --------------- Full sync (vault open) ---------------

  async fullSync(): Promise<void> {
    this.setStatus('syncing', 'Starting full sync…')
    try {
      await this.provider.prepareRemoteRoot?.()

      const localChanges = await detectLocalChanges(this.fs, this.state)
      const manifestMap = new Map<string, SyncManifestEntry>()
      for (const e of await this.state.getAllEntries()) {
        manifestMap.set(e.path, e)
      }

      // Collect all remote files
      const remoteMap = new Map<string, RemoteFileEntry>()
      let result = await this.provider.listFiles()
      for (const e of result.entries) {
        if (!e.isDirectory) remoteMap.set(e.path, e)
      }
      while (result.hasMore && result.cursor) {
        result = await this.provider.listFiles(result.cursor)
        for (const e of result.entries) {
          if (!e.isDirectory) remoteMap.set(e.path, e)
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
            localChanges.modified.includes(path) ||
            localChanges.created.includes(path)
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

  private async applyRemoteChanges(
    entries: RemoteFileEntry[],
    deleted: string[],
  ): Promise<void> {
    for (const remote of entries) {
      if (remote.isDirectory) continue
      const manifestEntry = await this.state.getEntry(remote.path)

      if (!manifestEntry || manifestEntry.remoteHash !== remote.hash) {
        await this.pullFile(remote.path, remote)
      }
    }

    for (const path of deleted) {
      const exists = await this.fs.exists(path)
      if (exists) {
        try {
          await this.fs.remove(path)
        } catch {
          // already gone
        }
      }
      await this.state.removeEntry(path)
    }
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
    // If we have no prior sync record, local is considered "created" — local wins
    if (!manifestEntry) return 'local'

    // If remote hash hasn't changed but local has, local wins
    if (manifestEntry.remoteHash === remote.hash) return 'local'

    // If local hash hasn't changed but remote has, remote wins
    const isLocalChanged =
      localChanges.modified.includes(path) || localChanges.created.includes(path)
    if (!isLocalChanged) return 'remote'

    // Both changed: last-write-wins by modifiedAt; tie goes to remote
    const remoteTime = new Date(remote.modifiedAt).getTime()
    const lastSync = new Date(manifestEntry.lastSyncedAt).getTime()
    if (remoteTime > lastSync) return 'remote'
    return 'local'
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
