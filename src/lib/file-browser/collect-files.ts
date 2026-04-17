import type { FileSystemAdapter } from '@/lib/fs'
import type { FileEntry } from '@/types/files'
import { isHiddenPath } from '@/types/files'
import type { FbFileItem, FbSort } from '@/types/file-browser'

function toFbItem(e: FileEntry): FbFileItem {
  return {
    path: e.path,
    name: e.name,
    type: e.type as FbFileItem['type'],
    isDirectory: e.isDirectory,
    size: e.size ?? 0,
    modifiedAt: e.modifiedAt ?? new Date(0).toISOString(),
  }
}

/** Flat list of files in `folder`. Excludes hidden paths by default. */
export async function collectBrowserFiles(
  vaultFs: FileSystemAdapter,
  folder: string,
  showHidden = false,
): Promise<FbFileItem[]> {
  const entries = await vaultFs.readdir(folder)
  return entries
    .filter((e) => showHidden || !isHiddenPath(e.path))
    .map(toFbItem)
}

function cmp(a: string | number, b: string | number, dir: 'asc' | 'desc'): number {
  const m = dir === 'asc' ? 1 : -1
  if (typeof a === 'string' && typeof b === 'string')
    return m * a.localeCompare(b, undefined, { sensitivity: 'base' })
  return m * (Number(a) - Number(b))
}

export function sortBrowserFiles(files: FbFileItem[], sort: FbSort): FbFileItem[] {
  return [...files].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    switch (sort.field) {
      case 'name':
        return cmp(a.name, b.name, sort.dir)
      case 'modifiedAt':
        return cmp(a.modifiedAt, b.modifiedAt, sort.dir)
      case 'size':
        return cmp(a.size, b.size, sort.dir)
      case 'type':
        return cmp(a.type, b.type, sort.dir) || cmp(a.name, b.name, 'asc')
      default:
        return 0
    }
  })
}

export function filterBrowserFiles(
  files: FbFileItem[],
  types?: string[],
): FbFileItem[] {
  if (!types?.length) return files
  const s = new Set(types)
  return files.filter((f) => f.isDirectory || s.has(f.type))
}
