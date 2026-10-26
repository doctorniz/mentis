import { BookOpen } from 'lucide-react'
import type { ViewComponent, ViewDefinition } from '@/core/registries/views'

declare module '@/core/registries/views' {
  interface ViewIds {
    journal: true
  }
}

/** A day's journal as tabs. Opened from the sidebar's date card (Ctrl+1) and the calendar, not the nav list. */
const view: ViewDefinition = {
  id: 'journal',
  label: 'Journal',
  icon: BookOpen,
  component: () =>
    import('@/components/journal/journal-view').then((m) => ({
      default: m.JournalView as ViewComponent,
    })),
  shortcut: '1',
}

export default view
