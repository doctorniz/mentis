import { BookOpen } from 'lucide-react'
import type { ViewComponent, ViewDefinition } from '@/core/registries/views'

declare module '@/core/registries/views' {
  interface ViewIds {
    journal: true
  }
}

/** A day's journal as tabs. Opened from the sidebar date and the calendar, not the nav. */
const view: ViewDefinition = {
  id: 'journal',
  label: 'Journal',
  icon: BookOpen,
  component: () =>
    import('@/components/journal/journal-view').then((m) => ({
      default: m.JournalView as ViewComponent,
    })),
}

export default view
