import { Columns3 } from 'lucide-react'
import type { FileTypeDefinition } from '@/core/registries/file-types'

const definition: FileTypeDefinition = {
  id: 'kanban',
  label: 'Kanban board',
  layout: {
    rightColumn: {
      storageKey: 'mentis:right-panel-width:kanban',
      defaultRightPx: 360,
      minRightPx: 280,
    },
    chat: 'index',
  },
  suffixes: ['.kan.md'],
  editor: () => import('./editor'),
  appearance: { icon: Columns3, treeClass: 'text-amber-400/70' },
  search: { read: 'text', reindexOnSave: true },
  createNew: {
    label: 'Kanban',
    stem: 'Kanban',
    suffix: '.kan.md',
    menu: { icon: Columns3, accentClass: 'text-amber-500', order: 40 },
    content: () => import('./create'),
  },
  linkable: true,
  openAfterImport: true,
}

export default definition
