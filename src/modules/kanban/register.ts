import { Columns3 } from 'lucide-react'
import type { FileTypeDefinition } from '@/core/registries/file-types'

const definition: FileTypeDefinition = {
  id: 'kanban',
  label: 'Kanban board',
  suffixes: ['.kanban'],
  // A markdown file whose frontmatter says `type: kanban` is a board.
  claims: {
    baseType: 'markdown',
    test: async (text) => (await import('./detect')).isKanbanMarkdown(text),
  },
  editor: () => import('./editor'),
  appearance: { icon: Columns3, treeClass: 'text-amber-400/70' },
  search: { extract: () => import('./search'), reindexOnSave: true },
  createNew: {
    label: 'Kanban',
    stem: 'Kanban',
    suffix: '.kanban',
    menu: { icon: Columns3, accentClass: 'text-amber-500', order: 40 },
    content: () => import('./create'),
  },
  openAfterImport: true,
}

export default definition
