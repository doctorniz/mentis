import { Files } from 'lucide-react'
import type { ViewComponent, ViewDefinition } from '@/core/registries/views'

declare module '@/core/registries/views' {
  interface ViewIds {
    files: true
  }
}

const view: ViewDefinition = {
  id: 'files',
  label: 'Files',
  icon: Files,
  component: () =>
    import('@/components/views/files-view').then((m) => ({
      default: m.FilesView as ViewComponent,
    })),
  nav: { order: 5, shortcut: '5' },
}

export default view
