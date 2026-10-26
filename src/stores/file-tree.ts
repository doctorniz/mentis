import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { FileEntry } from '@/types/files'

/** Path → expanded (Immer-friendly; avoid `Set` without enableMapSet). */
export type ExpandedPathsMap = Record<string, true>

interface FileTreeState {
  root: FileEntry | null
  selectedPath: string | null
  expandedPaths: ExpandedPathsMap
  starredPaths: string[]
  /** Bumped when files were created, renamed or deleted: trees re-list their folders. */
  refreshToken: number

  setRoot: (root: FileEntry) => void
  setSelectedPath: (path: string | null) => void
  toggleExpanded: (path: string) => void
  setExpanded: (path: string, expanded: boolean) => void
  toggleStarred: (path: string) => void
  isStarred: (path: string) => boolean
  refreshTree: () => void
}

export const useFileTreeStore = create<FileTreeState>()(
  immer((set, get) => ({
    root: null,
    selectedPath: null,
    expandedPaths: {},
    starredPaths: [],
    refreshToken: 0,

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
        if (state.expandedPaths[path]) {
          delete state.expandedPaths[path]
        } else {
          state.expandedPaths[path] = true
        }
      }),

    setExpanded: (path, expanded) =>
      set((state) => {
        if (expanded) {
          state.expandedPaths[path] = true
        } else {
          delete state.expandedPaths[path]
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

    refreshTree: () =>
      set((state) => {
        state.refreshToken += 1
      }),
  })),
)
