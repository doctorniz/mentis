import { CheckSquare } from 'lucide-react'
import type { ViewComponent, ViewDefinition } from '@/core/registries/views'

declare module '@/core/registries/views' {
  interface ViewIds {
    tasks: true
    organizer: true
  }
}

/** Tasks, with Lists as a second tab. The Calendar is its own view (modules/calendar). */
const view: ViewDefinition = {
  id: 'tasks',
  label: 'Tasks',
  icon: CheckSquare,
  component: () =>
    import('@/components/views/tasks-page').then((m) => ({
      default: m.TasksPage as ViewComponent,
    })),
  nav: { order: 2 },
  shortcut: '4',
  aliases: [
    // The Organizer held Tasks, Lists, Calendar and Reminders as tabs; saved
    // state that names it lands on Tasks.
    { id: 'organizer' },
  ],
}

export default view
