import type { FileEntry } from '@/types/files'
import { fileTypes } from '@/core/registries'

/** Hide app-internal dirs from the Notes sidebar. */
export function isNotesTreeHidden(entry: FileEntry): boolean {
  if (entry.name === '_marrow' || entry.name === '_assets') return true
  const parts = entry.path.split('/')
  return parts.some((p) => p === '_marrow' || p === '_assets')
}

/** Folders always (if not hidden). Files: any type a module registers. */
export function isNotesTreeEntry(entry: FileEntry): boolean {
  if (isNotesTreeHidden(entry)) return false
  if (entry.isDirectory) return true
  return fileTypes.resolve(entry.path) !== undefined
}

export function sortTreeEntries(a: FileEntry, b: FileEntry): number {
  if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}
