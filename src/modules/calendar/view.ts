import { CalendarDays } from 'lucide-react'
import type { ViewComponent, ViewDefinition } from '@/core/registries/views'

declare module '@/core/registries/views' {
  interface ViewIds {
    calendar: true
  }
}

/** The calendar, with Reminders as a second tab. */
const view: ViewDefinition = {
  id: 'calendar',
  label: 'Calendar',
  icon: CalendarDays,
  component: () =>
    import('@/components/views/calendar-page').then((m) => ({
      default: m.CalendarPage as ViewComponent,
    })),
  nav: { order: 1 },
  shortcut: '3',
}

export default view
