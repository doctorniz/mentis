import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { EditorTab } from '@/types/editor'

interface EditorState {
  tabs: EditorTab[]
  activeTabId: string | null
  recentFiles: string[]
  /** When set, `NotesView` opens this path once (e.g. after Board → Vault). */
  pendingVaultOpenPath: string | null

  openTab: (tab: EditorTab) => void
  closeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  markDirty: (tabId: string, isDirty: boolean) => void
  updateTab: (
    tabId: string,
    updates: Partial<Pick<EditorTab, 'title' | 'isDirty' | 'showRawSource' | 'isNew'>>,
  ) => void
  clearNew: (tabId: string) => void
  /** After renaming a file on disk, move the tab to the new path. */
  retargetTabPath: (tabId: string, newPath: string, newTitle?: string) => void
  addRecentFile: (path: string) => void
  closeAllTabs: () => void
  setPendingVaultOpenPath: (path: string | null) => void
}

export const useEditorStore = create<EditorState>()(
  immer((set) => ({
    tabs: [],
    activeTabId: null,
    recentFiles: [],
    pendingVaultOpenPath: null,

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

    updateTab: (tabId, updates) =>
      set((state) => {
        const tab = state.tabs.find((t) => t.id === tabId)
        if (!tab) return
        if (updates.title !== undefined) tab.title = updates.title
        if (updates.isDirty !== undefined) tab.isDirty = updates.isDirty
        if (updates.showRawSource !== undefined) tab.showRawSource = updates.showRawSource
        if (updates.isNew !== undefined) tab.isNew = updates.isNew
      }),

    clearNew: (tabId) =>
      set((state) => {
        const tab = state.tabs.find((t) => t.id === tabId)
        if (tab) tab.isNew = false
      }),

    retargetTabPath: (tabId, newPath, newTitle) =>
      set((state) => {
        const tab = state.tabs.find((t) => t.id === tabId)
        if (!tab) return
        const oldPath = tab.path
        tab.path = newPath
        if (newTitle !== undefined) tab.title = newTitle
        state.recentFiles = state.recentFiles.map((p) => (p === oldPath ? newPath : p))
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

    setPendingVaultOpenPath: (path) =>
      set((state) => {
        state.pendingVaultOpenPath = path
      }),
  })),
)
