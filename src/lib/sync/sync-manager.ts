import type { FileSystemAdapter } from '@/lib/fs/types'
import type { RemoteSyncProvider, RemoteFileEntry, SyncManifestEntry, SyncStatus } from './types'
import { SyncState } from './sync-state'
import { detectLocalChanges, hashBytes, type HashCache } from './change-detector'
import { buildSyncExcludeMatcher } from './excludes'
import {
  conflictCopyPath,
  resolveSyncConflict,
  decideRemoteUpdate,
  decideRemoteDelete,
  decideLocalDelete,
  needsDeleteConfirmation,
  type RemoteDeleteAction,
} from './conflicts'
import { TRASH_DIR, expiredTrashDays, moveToLocalTrash, trashPath } from './trash'
import {
  canvasConflictCopy,
  canvasRefs,
  drawingAssetOf,
  isCanvasPath,
  isDrawingPath,
} from './canvas-conflict'
import { uniqueVaultPath } from '@/lib/fs/unique-path'
import { fileTypes } from '@/core/registries'
import { putFileHashes, validFileHashes } from '@/lib/search/index'

/** File hashes remembered in the vault index, so unchanged files are not re-read. */
const indexHashCache: HashCache = { valid: validFileHashes, put: putFileHashes }

export type SyncStatusListener = (status: SyncStatus, message?: string) => void

/** A true conflict: both sides changed; the losing side was saved as `copyPath`. */
export interface SyncConflict {
  path: string
  winner: 'local' | 'remote'
  copyPath: string
}

export type SyncConflictListener = (conflict: SyncConflict) => void

/** A true conflict on a drawing's file, and which side's version stays. */
interface DrawingConflict {
  path: string
  winner: 'local' | 'remote'
}

/**
 * Asked before a run deletes many files (see `needsDeleteConfirmation`).
 * Resolves true to delete them (into the trash), false to keep them: each
 * file is restored on the side it is missing from.
 */
export type DeleteConfirmer = (counts: { deletes: number; tracked: number }) => Promise<boolean>

export class SyncManager {
  private state: SyncState
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private listeners = new Set<SyncStatusListener>()
  private conflictListeners = new Set<SyncConflictListener>()
  private confirmDeletes: DeleteConfirmer | null = null
  /** The full sync or pull in progress; a poll tick during it is skipped. */
  private inFlight: Promise<void> | null = null
  /** The remote trash is emptied of old days once per manager (per launch). */
  private remoteTrashPruned = false
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

  /** Without a confirmer, a run that needs confirmation keeps the files. */
  onConfirmDeletes(confirmer: DeleteConfirmer): void {
    this.confirmDeletes = confirmer
  }

  private setStatus(status: SyncStatus, message?: string) {
    this._status = status
    for (const fn of this.listeners) fn(status, message)
  }

  /** One full sync or pull at a time; a second full sync joins the first. */
  private exclusive(run: () => Promise<void>): Promise<void> {
    const p: Promise<void> = run().finally(() => {
      if (this.inFlight === p) this.inFlight = null
    })
    this.inFlight = p
    return p
  }

  /** Resolves true when the run may delete; asks only when the guard trips. */
  private async mayDelete(deletes: number, tracked: number): Promise<boolean> {
    if (!needsDeleteConfirmation(deletes, tracked)) return true
    this.setStatus('syncing', `Waiting to confirm ${deletes} deletions…`)
    return (await this.confirmDeletes?.({ deletes, tracked })) ?? false
  }

  // --------------- Full sync (vault open) ---------------

  fullSync(): Promise<void> {
    return this.inFlight ?? this.exclusive(() => this.runFullSync())
  }

  private async runFullSync(): Promise<void> {
    this.setStatus('syncing', 'Starting full sync…')
    this.announcedConflicts.clear()
    try {
      await this.provider.prepareRemoteRoot?.()

      const localChanges = await detectLocalChanges(
        this.fs,
        this.state,
        this.isExcluded,
        indexHashCache,
      )
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

      // Work out every delete before changing anything, so a run that
      // would delete many files can ask first.
      const locallyChanged = new Set([...localChanges.created, ...localChanges.modified])
      const locallyDeleted = new Set(localChanges.deleted)
      const trashRemote: string[] = []
      const pullBack: string[] = []
      const forget: string[] = []
      for (const path of localChanges.deleted) {
        const entry = manifestMap.get(path)
        if (!entry) continue
        const action = decideLocalDelete({
          manifestEntry: entry,
          remoteHash: remoteMap.get(path)?.hash ?? null,
        })
        if (action === 'trash-remote') trashRemote.push(path)
        else if (action === 'pull') pullBack.push(path)
        else forget.push(path)
      }
      // In the manifest, gone from the remote, unchanged here: deleted remotely.
      // A local edit is pushed back by the push loop below instead.
      const trashLocal: string[] = []
      for (const entry of manifestMap.values()) {
        if (remoteMap.has(entry.path) || locallyDeleted.has(entry.path)) continue
        if (locallyChanged.has(entry.path)) continue
        if (await this.fs.exists(entry.path)) trashLocal.push(entry.path)
        else forget.push(entry.path)
      }

      const deletes = trashRemote.length + trashLocal.length
      const keep = !(await this.mayDelete(deletes, manifestMap.size))
      this.setStatus('syncing', 'Syncing…')

      // Conflicting drawings are copied whole before any of their files moves.
      const drawingConflicts: DrawingConflict[] = []
      for (const path of locallyChanged) {
        const remote = remoteMap.get(path)
        if (!remote || !isDrawingPath(path)) continue
        const manifestEntry = manifestMap.get(path)
        if (!manifestEntry) {
          if (await this.differsFromRemote(path, remote)) {
            drawingConflicts.push({ path, winner: 'local' })
          }
          continue
        }
        const decision = resolveSyncConflict({
          isLocallyChanged: true,
          remoteHash: remote.hash,
          remoteModifiedAt: remote.modifiedAt,
          manifestEntry,
        })
        if (decision.isTrueConflict) drawingConflicts.push({ path, winner: decision.winner })
      }
      await this.keepLosingDrawings(drawingConflicts, [...remoteMap.keys(), ...locallyChanged])

      // Push local creates and modifications
      const settled = new Set<string>()
      for (const path of [...localChanges.created, ...localChanges.modified]) {
        const remote = remoteMap.get(path)
        if (remote && !manifestMap.has(path)) {
          await this.settleUntracked(path, remote)
          settled.add(path)
          continue
        }
        if (remote) {
          const winner = await this.resolveConflict(
            path,
            localChanges,
            remote,
            manifestMap.get(path),
          )
          if (winner === 'remote') {
            await this.pullFile(path, remote)
            continue
          }
        }
        await this.pushFileInternal(path)
      }

      // Pull remote files that are new or newer
      for (const [path, remote] of remoteMap) {
        if (remote.isDirectory || settled.has(path) || locallyDeleted.has(path)) continue
        const manifestEntry = manifestMap.get(path)

        if (!manifestEntry) {
          // New remote file — pull
          await this.pullFile(path, remote)
        } else if (manifestEntry.remoteHash !== remote.hash) {
          // Remote changed since last sync
          if (locallyChanged.has(path)) {
            const winner = await this.resolveConflict(path, localChanges, remote, manifestEntry)
            if (winner === 'remote') {
              await this.pullFile(path, remote)
            }
            // if local wins, it was already pushed above
          } else {
            await this.pullFile(path, remote)
          }
        }
      }

      // Deleted here, edited remotely since: the edit comes back.
      for (const path of pullBack) await this.pullFile(path, remoteMap.get(path)!)

      // Deleted here: trash the remote copy, or (kept) download it again.
      for (const path of trashRemote) {
        if (keep) {
          await this.pullFile(path, remoteMap.get(path)!)
        } else {
          await this.trashRemoteFile(path)
          await this.state.removeEntry(path)
        }
      }

      // Deleted remotely: trash the local file, or (kept) upload it again.
      for (const path of trashLocal) {
        if (keep) {
          await this.pushFileInternal(path)
        } else {
          await moveToLocalTrash(this.fs, path)
          await this.state.removeEntry(path)
        }
      }

      for (const path of forget) await this.state.removeEntry(path)

      if (result.cursor) {
        await this.state.setCursor(result.cursor)
      }
      await this.state.setLastSyncTimestamp(new Date().toISOString())

      if (!this.remoteTrashPruned) {
        this.remoteTrashPruned = true
        await this.pruneRemoteTrash().catch(() => {})
      }
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

    await this.ensureRemoteDirs(path)

    const remote = await this.provider.upload(path, data)
    await this.state.setEntry({
      path,
      localHash,
      remoteHash: remote.hash,
      lastSyncedAt: new Date().toISOString(),
    })
  }

  /** Create the remote parent folders of `path`. */
  private async ensureRemoteDirs(path: string): Promise<void> {
    const parts = path.split('/')
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

  // --------------- Trash ---------------

  /** Move a remote file into the remote's trash folder for today. */
  private async trashRemoteFile(path: string): Promise<void> {
    const dest = trashPath(path, new Date())
    await this.ensureRemoteDirs(dest)
    await this.provider.move(path, dest)
  }

  /** Empty the remote trash's day folders older than a month. */
  private async pruneRemoteTrash(): Promise<void> {
    const days = await this.provider.listFolders(TRASH_DIR)
    for (const day of expiredTrashDays(days, new Date())) {
      await this.provider.remove(`${TRASH_DIR}/${day}`)
    }
  }

  // --------------- Pull remote changes (periodic) ---------------

  pull(): Promise<void> {
    if (this.inFlight) return Promise.resolve()
    return this.exclusive(() => this.runPull())
  }

  private async runPull(): Promise<void> {
    this.setStatus('syncing', 'Pulling remote changes…')
    this.announcedConflicts.clear()
    try {
      const cursor = await this.state.getCursor()

      if (cursor && this.provider.type === 'dropbox') {
        // Collect every page first, so deletes can be counted before any
        // is applied. A later page's event for a path replaces an earlier one.
        const changes = new Map<string, RemoteFileEntry | null>()
        let page = await this.provider.listChanges(cursor)
        for (;;) {
          for (const e of page.entries) changes.set(e.path, e)
          for (const p of page.deleted) changes.set(p, null)
          if (!page.hasMore) break
          page = await this.provider.listChanges(page.cursor)
        }
        await this.applyRemoteChanges(changes)
        await this.state.setCursor(page.cursor)
      } else {
        // Fallback: full listing comparison (no delta cursor yet)
        await this.runFullSync()
        return
      }

      await this.state.setLastSyncTimestamp(new Date().toISOString())
      this.setStatus('idle')
    } catch (err) {
      this.setStatus('error', err instanceof Error ? err.message : String(err))
      throw err
    }
  }

  /** `changes` maps each path to its new remote entry, or null when deleted. */
  private async applyRemoteChanges(changes: Map<string, RemoteFileEntry | null>): Promise<void> {
    const updates: RemoteFileEntry[] = []
    const deletes = new Map<string, RemoteDeleteAction>()
    for (const [path, remote] of changes) {
      if (this.isExcluded(path)) continue
      if (remote) {
        if (!remote.isDirectory) updates.push(remote)
        continue
      }
      const manifestEntry = await this.state.getEntry(path)
      const localExists = await this.fs.exists(path)
      deletes.set(
        path,
        decideRemoteDelete({
          manifestEntry,
          localExists,
          localHash: localExists ? await this.currentLocalHash(path) : null,
        }),
      )
    }

    const toTrash = [...deletes].filter(([, a]) => a === 'delete-local').map(([p]) => p)
    const tracked = (await this.state.getAllEntries()).filter((e) => !this.isExcluded(e.path))
    const keep = !(await this.mayDelete(toTrash.length, tracked.length))
    this.setStatus('syncing', 'Pulling remote changes…')

    // Conflicting drawings are copied whole before any of their files moves.
    const drawingConflicts: DrawingConflict[] = []
    for (const remote of updates) {
      if (!isDrawingPath(remote.path)) continue
      const manifestEntry = await this.state.getEntry(remote.path)
      const localHash = await this.currentLocalHash(remote.path)
      if (!manifestEntry) {
        if (localHash !== null && (await this.differsFromRemote(remote.path, remote))) {
          drawingConflicts.push({ path: remote.path, winner: 'local' })
        }
        continue
      }
      const decision = decideRemoteUpdate({
        manifestEntry,
        localHash,
        remoteHash: remote.hash,
        remoteModifiedAt: remote.modifiedAt,
      })
      if (decision.isTrueConflict) {
        drawingConflicts.push({
          path: remote.path,
          winner: decision.action === 'pull' ? 'remote' : 'local',
        })
      }
    }
    await this.keepLosingDrawings(drawingConflicts, [
      ...tracked.map((e) => e.path),
      ...updates.map((u) => u.path),
    ])

    for (const remote of updates) {
      const manifestEntry = await this.state.getEntry(remote.path)
      const localHash = await this.currentLocalHash(remote.path)

      if (!manifestEntry && localHash !== null) {
        await this.settleUntracked(remote.path, remote)
        continue
      }

      const decision = decideRemoteUpdate({
        manifestEntry,
        localHash,
        remoteHash: remote.hash,
        remoteModifiedAt: remote.modifiedAt,
      })

      if (decision.isTrueConflict) {
        await this.keepLosingSide(remote.path, decision.action === 'pull' ? 'remote' : 'local')
      }

      if (decision.action === 'pull') {
        await this.pullFile(remote.path, remote)
      } else if (decision.action === 'push-local') {
        // Unpushed local edit wins — re-assert it instead of clobbering.
        // The upload also realigns the manifest.
        await this.pushFileInternal(remote.path)
      }
    }

    for (const [path, action] of deletes) {
      if (action === 'push-local' || (action === 'delete-local' && keep)) {
        // Local edit wins over remote delete (full sync's re-upload rule),
        // or the user chose to keep the files.
        await this.pushFileInternal(path)
        continue
      }
      if (action === 'keep-local') continue
      if (action === 'delete-local') await moveToLocalTrash(this.fs, path)
      await this.state.removeEntry(path)
    }
  }

  /**
   * A file on both sides that sync has no record of: a reconnect, a wiped
   * manifest, or a second device using the same remote folder. Same bytes:
   * just record it. Different: local stays, and the remote version is kept
   * as a conflict copy instead of being overwritten.
   */
  private async settleUntracked(path: string, remote: RemoteFileEntry): Promise<void> {
    if (!(await this.differsFromRemote(path, remote))) {
      await this.state.setEntry({
        path,
        localHash: await hashBytes(await this.fs.readFile(path)),
        remoteHash: remote.hash,
        lastSyncedAt: new Date().toISOString(),
      })
      return
    }
    await this.keepLosingSide(path, 'local')
    await this.pushFileInternal(path)
  }

  /** Whether the local file's bytes differ from `remote` (assumed so when the
   *  provider cannot hash content the way it does). */
  private async differsFromRemote(path: string, remote: RemoteFileEntry): Promise<boolean> {
    if (!this.provider.contentHash) return true
    return (await this.provider.contentHash(await this.fs.readFile(path))) !== remote.hash
  }

  /** SHA-256 of the local file's current bytes; null when missing/unreadable. */
  private async currentLocalHash(path: string): Promise<string | null> {
    try {
      return await hashBytes(await this.fs.readFile(path))
    } catch {
      return null
    }
  }

  /**
   * Before a true conflict overwrites one side, save that side beside the
   * file as a conflict copy (which then syncs like any file), and tell the
   * listeners. If the copy cannot be saved this throws, so nothing is
   * overwritten. Runs once per path per sync run.
   */
  private async keepLosingSide(path: string, winner: 'local' | 'remote'): Promise<void> {
    if (this.announcedConflicts.has(path)) return
    const loser =
      winner === 'remote' ? await this.fs.readFile(path) : await this.provider.download(path)
    const copyPath = await uniqueVaultPath(
      this.fs,
      conflictCopyPath(path, new Date(), fileTypes.matchedSuffix(path)),
      fileTypes.matchedSuffix(path),
    )
    await this.fs.writeFile(copyPath, loser)
    await this.pushFileInternal(copyPath)
    this.announcedConflicts.add(path)
    for (const fn of this.conflictListeners) fn({ path, winner, copyPath })
  }

  /**
   * Save the losing side of each conflicting drawing whole, before any of its
   * files is transferred: a drawing is its `.canvas` file and a PNG per layer,
   * and per-file copies of those do not make a drawing (canvas-conflict.ts).
   * A layer file's drawing is found among `canvases` by its asset id. Paths
   * handled here are marked announced, so no per-file copy is made of them;
   * a drawing that cannot be copied this way (an older format) is left to the
   * per-file copies.
   */
  private async keepLosingDrawings(
    conflicts: DrawingConflict[],
    canvases: Iterable<string>,
  ): Promise<void> {
    if (conflicts.length === 0) return
    const readLocal = async (path: string) => {
      try {
        return await this.fs.readFile(path)
      } catch {
        return null
      }
    }
    const readRemote = async (path: string) => {
      try {
        return await this.provider.download(path)
      } catch {
        return null
      }
    }

    let canvasOfAsset: Map<string, string> | null = null
    const groups = new Map<string, { winner: 'local' | 'remote'; paths: string[] }>()
    for (const conflict of conflicts) {
      let canvasPath = isCanvasPath(conflict.path) ? conflict.path : null
      if (!canvasPath) {
        if (!canvasOfAsset) {
          canvasOfAsset = new Map()
          for (const path of new Set(canvases)) {
            if (!isCanvasPath(path)) continue
            const bytes = (await readLocal(path)) ?? (await readRemote(path))
            const refs = bytes && canvasRefs(bytes)
            if (refs) canvasOfAsset.set(refs.assetId, path)
          }
        }
        canvasPath = canvasOfAsset.get(drawingAssetOf(conflict.path)!) ?? null
      }
      if (!canvasPath) continue
      const group = groups.get(canvasPath) ?? { winner: conflict.winner, paths: [] }
      group.paths.push(conflict.path)
      groups.set(canvasPath, group)
    }

    for (const [canvasPath, { winner, paths }] of groups) {
      const suffix = fileTypes.matchedSuffix(canvasPath)
      const copyPath = await uniqueVaultPath(
        this.fs,
        conflictCopyPath(canvasPath, new Date(), suffix),
        suffix,
      )
      const files = await canvasConflictCopy({
        canvasPath,
        copyPath,
        newAssetId: crypto.randomUUID(),
        read: winner === 'remote' ? readLocal : readRemote,
      })
      if (!files) continue
      for (const [path, data] of files) {
        await this.ensureLocalDirs(path)
        await this.fs.writeFile(path, data)
        await this.pushFileInternal(path)
      }
      for (const path of [canvasPath, ...paths]) this.announcedConflicts.add(path)
      for (const fn of this.conflictListeners) fn({ path: canvasPath, winner, copyPath })
    }
  }

  /** Create the local parent folders of `path`. */
  private async ensureLocalDirs(path: string): Promise<void> {
    const parts = path.split('/')
    let dir = ''
    for (let i = 0; i < parts.length - 1; i++) {
      dir = dir ? `${dir}/${parts[i]}` : parts[i]
      if (!(await this.fs.exists(dir))) await this.fs.mkdir(dir)
    }
  }

  private async pullFile(path: string, remote: RemoteFileEntry): Promise<void> {
    const data = await this.provider.download(path)
    const localHash = await hashBytes(data)

    await this.ensureLocalDirs(path)
    await this.fs.writeFile(path, data)
    await this.state.setEntry({
      path,
      localHash,
      remoteHash: remote.hash,
      lastSyncedAt: new Date().toISOString(),
    })
  }

  // --------------- Conflict resolution ---------------

  private async resolveConflict(
    path: string,
    localChanges: { created: string[]; modified: string[] },
    remote: RemoteFileEntry,
    manifestEntry: SyncManifestEntry | undefined,
  ): Promise<'local' | 'remote'> {
    const decision = resolveSyncConflict({
      isLocallyChanged: localChanges.modified.includes(path) || localChanges.created.includes(path),
      remoteHash: remote.hash,
      remoteModifiedAt: remote.modifiedAt,
      manifestEntry,
    })

    // TRUE conflicts (both sides changed): keep the side about to be replaced.
    if (decision.isTrueConflict) await this.keepLosingSide(path, decision.winner)

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
