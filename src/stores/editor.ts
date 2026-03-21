import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { EditorTab } from '@/types/editor'

interface EditorState {
  tabs: EditorTab[]
  activeTabId: string | null
  recentFiles: string[]

  openTab: (tab: EditorTab) => void
  closeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  markDirty: (tabId: string, isDirty: boolean) => void
  addRecentFile: (path: string) => void
  closeAllTabs: () => void
}

export const useEditorStore = create<EditorState>()(
  immer((set) => ({
    tabs: [],
    activeTabId: null,
    recentFiles: [],

    openTab: (tab) =>
      set((state) => {
        const existing = state.tabs.find((t) => t.path === tab.path)
        if (existing) {
          state.activeTabId = existing.id
        } else {
          state.tabs.push(tab)
          state.activeTabId = tab.id
        }
      }),

    closeTab: (tabId) =>
      set((state) => {
        const index = state.tabs.findIndex((t) => t.id === tabId)
        if (index === -1) return

        state.tabs.splice(index, 1)

        if (state.activeTabId === tabId) {
          const nextTab = state.tabs[Math.min(index, state.tabs.length - 1)]
          state.activeTabId = nextTab?.id ?? null
        }
      }),

    setActiveTab: (tabId) =>
      set((state) => {
        state.activeTabId = tabId
      }),

    markDirty: (tabId, isDirty) =>
      set((state) => {
        const tab = state.tabs.find((t) => t.id === tabId)
        if (tab) tab.isDirty = isDirty
      }),

    addRecentFile: (path) =>
      set((state) => {
        state.recentFiles = [path, ...state.recentFiles.filter((p) => p !== path)].slice(
          0,
          20,
        )
      }),

    closeAllTabs: () =>
      set((state) => {
        state.tabs = []
        state.activeTabId = null
      }),
  })),
)
