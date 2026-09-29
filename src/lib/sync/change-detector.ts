import type { FileSystemAdapter } from '@/lib/fs/types'
import type { SyncManifestEntry, LocalChangeSet } from './types'
import { SyncState } from './sync-state'
import type { FileHash, ManifestEntry } from '@/core/index/protocol'

/**
 * Remembers file hashes between syncs, keyed by path, size and mtime (the
 * vault index's `hashes` table). Without one, every file is read and hashed.
 */
export interface HashCache {
  /** Hashes still valid for `files`, forgetting files not listed; null = unavailable. */
  valid(files: ManifestEntry[]): Promise<Record<string, string> | null>
  put(hashes: FileHash[]): Promise<void>
}

const HASH_SAVE_BATCH = 50

export async function hashBytes(data: Uint8Array): Promise<string> {
  const buf = new Uint8Array(data).buffer as ArrayBuffer
  const digest = await crypto.subtle.digest('SHA-256', buf)
  const arr = new Uint8Array(digest)
  const hex: string[] = []
  for (let i = 0; i < arr.length; i++) {
    hex.push(arr[i].toString(16).padStart(2, '0'))
  }
  return hex.join('')
}

/** Every non-excluded file with the size and mtime `readdir` reports — no reads. */
async function walkDir(
  fs: FileSystemAdapter,
  dir: string,
  isExcluded: (path: string) => boolean,
): Promise<ManifestEntry[]> {
  const entries = await fs.readdir(dir)
  const files: ManifestEntry[] = []
  for (const entry of entries) {
    if (isExcluded(entry.path)) continue
    if (entry.isDirectory) {
      const children = await walkDir(fs, entry.path, isExcluded)
      files.push(...children)
    } else {
      files.push({
        path: entry.path,
        size: entry.size ?? 0,
        mtime: entry.modifiedAt ? Date.parse(entry.modifiedAt) : 0,
      })
    }
  }
  return files
}

export async function detectLocalChanges(
  fs: FileSystemAdapter,
  state: SyncState,
  isExcluded: (path: string) => boolean = () => false,
  cache?: HashCache,
): Promise<LocalChangeSet> {
  const allFiles = await walkDir(fs, '', isExcluded)
  const cached = (await cache?.valid(allFiles).catch(() => null)) ?? {}
  const manifest = await state.getAllEntries()

  const manifestMap = new Map<string, SyncManifestEntry>()
  for (const entry of manifest) {
    // Stale manifest rows for now-excluded paths must not surface as
    // local deletes — sync treats excluded paths as invisible.
    if (isExcluded(entry.path)) continue
    manifestMap.set(entry.path, entry)
  }

  const created: string[] = []
  const modified: string[] = []
  const seenPaths = new Set<string>()

  let fresh: FileHash[] = []

  for (const file of allFiles) {
    const filePath = file.path
    seenPaths.add(filePath)
    // Unchanged size and mtime: reuse the cached hash instead of reading.
    let hash = cached[filePath]
    if (hash === undefined) {
      hash = await hashBytes(await fs.readFile(filePath))
      fresh.push({ ...file, hash })
      if (cache && fresh.length >= HASH_SAVE_BATCH) {
        await cache.put(fresh).catch(() => {})
        fresh = []
      }
    }
    const manifestEntry = manifestMap.get(filePath)

    if (!manifestEntry) {
      created.push(filePath)
    } else if (manifestEntry.localHash !== hash) {
      modified.push(filePath)
    }
  }

  if (cache) await cache.put(fresh).catch(() => {})

  const deleted: string[] = []
  for (const entry of manifestMap.values()) {
    if (!seenPaths.has(entry.path)) {
      deleted.push(entry.path)
    }
  }

  return { created, modified, deleted }
}
