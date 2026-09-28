import { CalendarCheck } from 'lucide-react'
import type { ViewComponent, ViewDefinition } from '@/core/registries/views'

const view: ViewDefinition = {
  id: 'organizer',
  label: 'Organizer',
  icon: CalendarCheck,
  component: () =>
    import('@/components/views/organizer-view').then((m) => ({
      default: m.OrganizerView as ViewComponent,
    })),
  nav: { order: 3, shortcut: '3' },
  aliases: [
    // Tasks and Calendar were folded into the Organizer as tabs.
    { id: 'tasks', props: { initialTab: 'tasks' } },
    { id: 'calendar', props: { initialTab: 'calendars' } },
  ],
}

export default view
