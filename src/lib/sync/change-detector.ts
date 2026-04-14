import type { FileSystemAdapter } from '@/lib/fs/types'
import type { SyncManifestEntry, LocalChangeSet } from './types'
import { SyncState } from './sync-state'

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

async function walkDir(
  fs: FileSystemAdapter,
  dir: string,
): Promise<string[]> {
  const entries = await fs.readdir(dir)
  const paths: string[] = []
  for (const entry of entries) {
    if (entry.isDirectory) {
      const children = await walkDir(fs, entry.path)
      paths.push(...children)
    } else {
      paths.push(entry.path)
    }
  }
  return paths
}

export async function detectLocalChanges(
  fs: FileSystemAdapter,
  state: SyncState,
): Promise<LocalChangeSet> {
  const allPaths = await walkDir(fs, '')
  const manifest = await state.getAllEntries()

  const manifestMap = new Map<string, SyncManifestEntry>()
  for (const entry of manifest) {
    manifestMap.set(entry.path, entry)
  }

  const created: string[] = []
  const modified: string[] = []
  const seenPaths = new Set<string>()

  for (const filePath of allPaths) {
    seenPaths.add(filePath)
    const data = await fs.readFile(filePath)
    const hash = await hashBytes(data)
    const manifestEntry = manifestMap.get(filePath)

    if (!manifestEntry) {
      created.push(filePath)
    } else if (manifestEntry.localHash !== hash) {
      modified.push(filePath)
    }
  }

  const deleted: string[] = []
  for (const entry of manifest) {
    if (!seenPaths.has(entry.path)) {
      deleted.push(entry.path)
    }
  }

  return { created, modified, deleted }
}
