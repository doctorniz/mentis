import type { FileSystemAdapter } from '@/lib/fs'
import type { TreeRow } from '@/core/index/protocol'
import { getTreeChildren, putTreeListings } from '@/lib/search/index'
import { getFileType, type FileEntry } from '@/types/files'
import { isNotesTreeEntry, sortTreeEntries } from '@/lib/notes/tree-filter'

export function toTreeRow(e: FileEntry): TreeRow {
  return {
    name: e.name,
    path: e.path,
    isDirectory: e.isDirectory,
    size: e.size ?? 0,
    mtime: e.modifiedAt ? Date.parse(e.modifiedAt) || 0 : 0,
  }
}

function fromTreeRow(r: TreeRow): FileEntry {
  return {
    name: r.name,
    path: r.path,
    isDirectory: r.isDirectory,
    type: r.isDirectory ? 'other' : getFileType(r.name),
    size: r.size,
  }
}

const signature = (entries: readonly { path: string; isDirectory: boolean }[]) =>
  entries.map((e) => `${e.isDirectory ? 'd' : 'f'}:${e.path}`).join('\n')

/**
 * Lists one folder for the tree. With `fromIndex`, if the index already knows
 * the folder it is reported at once, then the disk is read and reported only if
 * it differs, and the index is brought up to date. Without it (the tree is
 * already showing the folder, so a stale answer would flash deleted files), or
 * if the index is not open or has not seen the folder, the disk answer is the
 * first and only report.
 *
 * `report` receives entries in tree order. It is never called after `isCancelled`
 * turns true, and a late index answer never overwrites the disk's.
 */
export async function listFolder(
  fs: FileSystemAdapter,
  dir: string,
  report: (entries: FileEntry[]) => void,
  isCancelled: () => boolean = () => false,
  fromIndex = true,
): Promise<void> {
  let diskDone = false
  let shown: string | null = null

  const cached = (fromIndex ? getTreeChildren(dir) : Promise.resolve(null))
    .then((rows) => {
      if (!rows || diskDone || isCancelled()) return null
      const entries = rows.map(fromTreeRow).sort(sortTreeEntries)
      shown = signature(entries)
      report(entries)
      return shown
    })
    .catch(() => null)

  const live = (await fs.readdir(dir)).filter(isNotesTreeEntry).sort(sortTreeEntries)
  diskDone = true
  if (isCancelled()) return
  const liveSignature = signature(live)
  if (liveSignature !== shown) report(live)
  const known = await cached
  if (liveSignature !== known) {
    void putTreeListings([{ dir, entries: live.map(toTreeRow) }]).catch(() => {})
  }
}
