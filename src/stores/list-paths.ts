import { create } from 'zustand'

/**
 * Notes marked `type: list` that the index has seen, so the file tree can
 * show them as lists without opening them. `.list.md` files are lists by
 * name and need no entry here. Filled by the lists store and the tree.
 */
interface ListPathsState {
  paths: ReadonlySet<string>
  setPaths: (paths: Iterable<string>) => void
  /** Ask the index again. */
  refresh: () => Promise<void>
}

export const useListPathsStore = create<ListPathsState>()((set) => ({
  paths: new Set(),
  setPaths: (paths) => set({ paths: new Set(paths) }),
  refresh: async () => {
    const { getIndexPathsOfType } = await import('@/lib/search')
    try {
      set({ paths: new Set(await getIndexPathsOfType('list')) })
    } catch {
      /* the tree keeps what it had */
    }
  },
}))
