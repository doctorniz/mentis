import { LayoutGrid } from 'lucide-react'
import type { ViewComponent, ViewDefinition } from '@/core/registries/views'

const view: ViewDefinition = {
  id: 'board',
  label: 'Board',
  icon: LayoutGrid,
  component: () =>
    import('@/components/views/board-view').then((m) => ({
      default: m.BoardView as ViewComponent,
    })),
  nav: { order: 2, shortcut: '2' },
}

export default view
