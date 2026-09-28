import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { FbViewMode, FbSort, FbFilters } from '@/types/file-browser'

interface FileBrowserState {
  viewMode: FbViewMode
  sort: FbSort
  filters: FbFilters
  /** Paths currently checked for batch actions. Record avoids Immer Set issues. */
  selected: Record<string, true>
  currentFolder: string

  setViewMode: (mode: FbViewMode) => void
  setSort: (sort: FbSort) => void
  setFilters: (f: FbFilters) => void
  toggleSelected: (path: string) => void
  selectAll: (paths: string[]) => void
  setSelectedPaths: (paths: string[]) => void
  clearSelection: () => void
  isSelected: (path: string) => boolean
  setCurrentFolder: (folder: string) => void
}

export const useFileBrowserStore = create<FileBrowserState>()(
  immer((set, get) => ({
    viewMode: 'grid',
    sort: { field: 'name', dir: 'asc' },
    filters: {},
    selected: {},
    currentFolder: '',

    setViewMode: (mode) =>
      set((s) => {
        s.viewMode = mode
      }),

    setSort: (sort) =>
      set((s) => {
        s.sort = sort
      }),

    setFilters: (f) =>
      set((s) => {
        s.filters = f
      }),

    toggleSelected: (path) =>
      set((s) => {
        if (s.selected[path]) delete s.selected[path]
        else s.selected[path] = true
      }),

    selectAll: (paths) =>
      set((s) => {
        s.selected = {}
        for (const p of paths) s.selected[p] = true
      }),

    setSelectedPaths: (paths) =>
      set((s) => {
        s.selected = {}
        for (const p of paths) s.selected[p] = true
      }),

    clearSelection: () =>
      set((s) => {
        s.selected = {}
      }),

    isSelected: (path) => Boolean(get().selected[path]),

    setCurrentFolder: (folder) =>
      set((s) => {
        s.currentFolder = folder
        s.selected = {}
      }),
  })),
)
