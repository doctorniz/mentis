import { create } from 'zustand'
import type { FileSystemAdapter } from '@/lib/fs/types'
import { uniqueVaultPath } from '@/lib/fs/unique-path'
import {
  applyDueReset,
  emptyList,
  LIST_SUFFIX,
  listsDir,
  listTitle,
  parseList,
  serializeList,
  type ListKind,
} from '@/lib/lists'
import { getIndexPathsOfType, removeSearchDocument } from '@/lib/search'
import { reindexFilePath } from '@/lib/search/build-vault-index'
import { useListPathsStore } from '@/stores/list-paths'
import { useVaultStore } from '@/stores/vault'

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
  /** Every list the index knows: `.list.md` files and notes marked `type: list`. */
  loadLists: (fs: FileSystemAdapter) => Promise<void>
  /** A new, empty list in the lists folder. Resolves to its path. */
  createList: (fs: FileSystemAdapter, name: string, kind: ListKind) => Promise<string>
  removeList: (fs: FileSystemAdapter, path: string) => Promise<void>
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
    const paths = await getIndexPathsOfType('list').catch(() => [] as string[])
    useListPathsStore.getState().setPaths(paths)
    const summaries: ListSummary[] = []
    for (const path of paths) {
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
    const dir = listsDir(useVaultStore.getState().config)
    if (!(await fs.exists(dir))) await fs.mkdir(dir)
    const stem = name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'List'
    const path = await uniqueVaultPath(fs, `${dir}/${stem}${LIST_SUFFIX}`, LIST_SUFFIX)
    await fs.writeTextFile(path, serializeList(emptyList(kind)))
    await reindexFilePath(fs, path)
    window.dispatchEvent(new CustomEvent('ink:vault-changed'))
    await get().loadLists(fs)
    return path
  },

  removeList: async (fs, path) => {
    try {
      await fs.remove(path)
    } catch {
      /* already gone */
    }
    removeSearchDocument(path)
    window.dispatchEvent(new CustomEvent('ink:vault-changed'))
    set((s) => ({ lists: s.lists.filter((l) => l.path !== path) }))
  },
}))
