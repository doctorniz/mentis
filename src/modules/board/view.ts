import { LayoutGrid } from 'lucide-react'
import type { ViewComponent, ViewDefinition } from '@/core/registries/views'

declare module '@/core/registries/views' {
  interface ViewIds {
    board: true
  }
}

const view: ViewDefinition = {
  id: 'board',
  label: 'Thoughts',
  icon: LayoutGrid,
  component: () =>
    import('@/components/views/board-view').then((m) => ({
      default: m.BoardView as ViewComponent,
    })),
  nav: { order: 3 },
  shortcut: '5',
}

export default view
