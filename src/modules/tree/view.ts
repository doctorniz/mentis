import { FolderTree } from 'lucide-react'
import type { ViewComponent, ViewDefinition } from '@/core/registries/views'

declare module '@/core/registries/views' {
  interface ViewIds {
    tree: true
  }
}

/**
 * The file tree, full screen: the phone's Notes tab. A wide screen has the
 * tree in its sidebar instead, so this stays out of the palette.
 */
const view: ViewDefinition = {
  id: 'tree',
  label: 'Notes',
  icon: FolderTree,
  component: () =>
    import('@/components/shell/sidebar-files') as Promise<{ default: ViewComponent }>,
  palette: false,
}

export default view
