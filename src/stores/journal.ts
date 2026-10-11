import { create } from 'zustand'
import { formatLocalDate } from '@/lib/tasks/recurrence'
import { useUiStore } from '@/stores/ui'

interface JournalState {
  /** The day the journal view shows, YYYY-MM-DD. */
  date: string
  /** A tab to open on that day; none means its default tab. */
  tab: string | null
  setDate: (date: string) => void
  setTab: (tab: string | null) => void
  /** Show the journal view at this day (and tab). */
  openDay: (date?: string, tab?: string) => void
}

export const useJournalStore = create<JournalState>()((set) => ({
  date: formatLocalDate(new Date()),
  tab: null,
  setDate: (date) => set({ date, tab: null }),
  setTab: (tab) => set({ tab }),
  openDay: (date = formatLocalDate(new Date()), tab) => {
    set({ date, tab: tab ?? null })
    useUiStore.getState().setActiveView('journal')
  },
}))
