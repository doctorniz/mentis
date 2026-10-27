import { create } from 'zustand'

/** What the phone's tab bar can hold either side of Capture. */
export const TAB_KEYS = [
  'today',
  'calendar',
  'notes',
  'chat',
  'tasks',
  'thoughts',
  'bookmarks',
  'search',
] as const

export type TabKey = (typeof TAB_KEYS)[number]

export const MAX_TABS = 4
export const DEFAULT_TABS: readonly TabKey[] = ['today', 'calendar', 'notes', 'chat']

const STORAGE_KEY = 'ink-tab-bar'

function readStored(): TabKey[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        const keys = parsed.filter((k): k is TabKey => TAB_KEYS.includes(k as TabKey))
        return [...new Set(keys)].slice(0, MAX_TABS)
      }
    }
  } catch {
    /* noop */
  }
  return [...DEFAULT_TABS]
}

interface TabBarState {
  /** In order: the first two sit left of Capture, the rest right. */
  tabs: TabKey[]
  setTabs: (tabs: TabKey[]) => void
}

/** The phone's tab bar, chosen in Settings. This device's, so it lives outside the vault. */
export const useTabBarStore = create<TabBarState>()((set) => ({
  tabs: readStored(),
  setTabs: (tabs) => {
    const next = tabs.slice(0, MAX_TABS)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* noop */
    }
    set({ tabs: next })
  },
}))
