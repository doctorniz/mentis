import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { ViewMode, type VaultLayoutMode } from '@/types/vault'

export type ThemeChoice = 'light' | 'dark' | 'system'

interface UiState {
  activeView: ViewMode
  vaultMode: VaultLayoutMode
  isSidebarOpen: boolean
  sidebarWidth: number
  theme: ThemeChoice
  activeModal: string | null

  setActiveView: (view: ViewMode) => void
  setVaultMode: (mode: VaultLayoutMode) => void
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  setSidebarWidth: (width: number) => void
  setTheme: (theme: ThemeChoice) => void
  openModal: (id: string) => void
  closeModal: () => void
}

function readStoredTheme(): ThemeChoice {
  if (typeof window === 'undefined') return 'system'
  try {
    const v = localStorage.getItem('ink-theme')
    if (v === 'light' || v === 'dark') return v
  } catch { /* noop */ }
  return 'system'
}

function applyThemeClass(theme: ThemeChoice) {
  if (typeof document === 'undefined') return
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && matchMedia('(prefers-color-scheme:dark)').matches)
  document.documentElement.classList.toggle('dark', isDark)
}

function readStoredVaultMode(): VaultLayoutMode {
  if (typeof window === 'undefined') return 'tree'
  try {
    const v = localStorage.getItem('ink-vault-mode')
    if (v === 'browse' || v === 'tree') return v
  } catch { /* noop */ }
  return 'tree'
}

export const useUiStore = create<UiState>()(
  immer((set) => ({
    activeView: ViewMode.Vault,
    vaultMode: readStoredVaultMode(),
    isSidebarOpen: true,
    sidebarWidth: 260,
    theme: readStoredTheme(),
    activeModal: null,

    setActiveView: (view) =>
      set((state) => {
        state.activeView = view
      }),

    setVaultMode: (mode) =>
      set((state) => {
        state.vaultMode = mode
        try { localStorage.setItem('ink-vault-mode', mode) } catch { /* noop */ }
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
        try { localStorage.setItem('ink-theme', theme) } catch { /* noop */ }
        applyThemeClass(theme)
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

if (typeof window !== 'undefined') {
  applyThemeClass(useUiStore.getState().theme)

  const mq = matchMedia('(prefers-color-scheme:dark)')
  mq.addEventListener('change', () => {
    if (useUiStore.getState().theme === 'system') {
      applyThemeClass('system')
    }
  })
}
