import { create } from 'zustand'
import type { FileSystemAdapter } from '@/lib/fs/types'
import { uniqueVaultPath } from '@/lib/fs/unique-path'
import {
  applyDueReset,
  emptyList,
  isListPath,
  LIST_SUFFIX,
  LISTS_DIR,
  listTitle,
  parseList,
  serializeList,
  type ListKind,
} from '@/lib/lists'
import { getIndexManifest, isSearchIndexOpen } from '@/lib/search'

export interface ListSummary {
  path: string
  title: string
  kind: ListKind
  total: number
  done: number
  reset?: string
}

interface ListsState {
  lists: ListSummary[]
  loading: boolean
  /** Every list: `_mentis/_lists/`, plus `.list.md` files anywhere else the index knows. */
  loadLists: (fs: FileSystemAdapter) => Promise<void>
  /** A new, empty list in `_mentis/_lists/`. Resolves to its path. */
  createList: (fs: FileSystemAdapter, name: string, kind: ListKind) => Promise<string>
  removeList: (fs: FileSystemAdapter, path: string) => Promise<void>
}

async function listPaths(fs: FileSystemAdapter): Promise<string[]> {
  const paths = new Set<string>()
  try {
    for (const e of await fs.readdir(LISTS_DIR)) {
      if (!e.isDirectory && isListPath(e.name)) paths.add(`${LISTS_DIR}/${e.name}`)
    }
  } catch {
    /* no lists folder yet */
  }
  // `_mentis/` is not indexed, so the manifest adds exactly the lists in notebooks.
  if (isSearchIndexOpen()) {
    try {
      for (const entry of await getIndexManifest()) {
        if (isListPath(entry.path)) paths.add(entry.path)
      }
    } catch {
      /* the folder's lists are still shown */
    }
  }
  return [...paths]
}

/** Read a list, applying a scheduled reset that has come due (and saving it). */
export async function readListFile(fs: FileSystemAdapter, path: string) {
  const raw = await fs.readTextFile(path)
  const parsed = parseList(raw)
  const reset = applyDueReset(parsed)
  if (reset) await fs.writeTextFile(path, serializeList(reset))
  return reset ?? parsed
}

export const useListsStore = create<ListsState>()((set, get) => ({
  lists: [],
  loading: false,

  loadLists: async (fs) => {
    set({ loading: get().lists.length === 0 })
    const summaries: ListSummary[] = []
    for (const path of await listPaths(fs)) {
      try {
        const doc = await readListFile(fs, path)
        summaries.push({
          path,
          title: listTitle(path),
          kind: doc.kind,
          total: doc.items.length,
          done: doc.items.filter((i) => i.done).length,
          reset: doc.reset,
        })
      } catch {
        /* unreadable: leave it out */
      }
    }
    summaries.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
    set({ lists: summaries, loading: false })
  },

  createList: async (fs, name, kind) => {
    if (!(await fs.exists(LISTS_DIR))) await fs.mkdir(LISTS_DIR)
    const stem = name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'List'
    const path = await uniqueVaultPath(fs, `${LISTS_DIR}/${stem}${LIST_SUFFIX}`, LIST_SUFFIX)
    await fs.writeTextFile(path, serializeList(emptyList(kind)))
    await get().loadLists(fs)
    return path
  },

  removeList: async (fs, path) => {
    try {
      await fs.remove(path)
    } catch {
      /* already gone */
    }
    set((s) => ({ lists: s.lists.filter((l) => l.path !== path) }))
  },
}))
