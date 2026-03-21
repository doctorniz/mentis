import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { FileEntry } from '@/types/files'

interface FileTreeState {
  root: FileEntry | null
  selectedPath: string | null
  expandedPaths: Set<string>
  starredPaths: string[]

  setRoot: (root: FileEntry) => void
  setSelectedPath: (path: string | null) => void
  toggleExpanded: (path: string) => void
  setExpanded: (path: string, expanded: boolean) => void
  toggleStarred: (path: string) => void
  isStarred: (path: string) => boolean
}

export const useFileTreeStore = create<FileTreeState>()(
  immer((set, get) => ({
    root: null,
    selectedPath: null,
    expandedPaths: new Set<string>(),
    starredPaths: [],

    setRoot: (root) =>
      set((state) => {
        state.root = root
      }),

    setSelectedPath: (path) =>
      set((state) => {
        state.selectedPath = path
      }),

    toggleExpanded: (path) =>
      set((state) => {
        if (state.expandedPaths.has(path)) {
          state.expandedPaths.delete(path)
        } else {
          state.expandedPaths.add(path)
        }
      }),

    setExpanded: (path, expanded) =>
      set((state) => {
        if (expanded) {
          state.expandedPaths.add(path)
        } else {
          state.expandedPaths.delete(path)
        }
      }),

    toggleStarred: (path) =>
      set((state) => {
        const index = state.starredPaths.indexOf(path)
        if (index >= 0) {
          state.starredPaths.splice(index, 1)
        } else {
          state.starredPaths.push(path)
        }
      }),

    isStarred: (path) => get().starredPaths.includes(path),
  })),
)
