import { Bookmark } from 'lucide-react'
import type { ViewComponent, ViewDefinition } from '@/core/registries/views'

declare module '@/core/registries/views' {
  interface ViewIds {
    bookmarks: true
  }
}

const view: ViewDefinition = {
  id: 'bookmarks',
  label: 'Bookmarks',
  icon: Bookmark,
  component: () =>
    import('@/components/views/bookmarks-view').then((m) => ({
      default: m.BookmarksView as ViewComponent,
    })),
  nav: { order: 4, shortcut: '4' },
}

export default view
