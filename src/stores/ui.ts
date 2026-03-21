import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { ViewMode } from '@/types/vault'

interface UiState {
  activeView: ViewMode
  isSidebarOpen: boolean
  sidebarWidth: number
  theme: 'light' | 'dark' | 'system'
  activeModal: string | null

  setActiveView: (view: ViewMode) => void
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  setSidebarWidth: (width: number) => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  openModal: (id: string) => void
  closeModal: () => void
}

export const useUiStore = create<UiState>()(
  immer((set) => ({
    activeView: ViewMode.Notes,
    isSidebarOpen: true,
    sidebarWidth: 260,
    theme: 'system',
    activeModal: null,

    setActiveView: (view) =>
      set((state) => {
        state.activeView = view
      }),

    toggleSidebar: () =>
      set((state) => {
        state.isSidebarOpen = !state.isSidebarOpen
      }),

    setSidebarOpen: (open) =>
      set((state) => {
        state.isSidebarOpen = open
      }),

    setSidebarWidth: (width) =>
      set((state) => {
        state.sidebarWidth = Math.max(200, Math.min(400, width))
      }),

    setTheme: (theme) =>
      set((state) => {
        state.theme = theme
      }),

    openModal: (id) =>
      set((state) => {
        state.activeModal = id
      }),

    closeModal: () =>
      set((state) => {
        state.activeModal = null
      }),
  })),
)
