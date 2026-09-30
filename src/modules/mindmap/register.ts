import { GitBranch } from 'lucide-react'
import type { FileTypeDefinition } from '@/core/registries/file-types'

const definition: FileTypeDefinition = {
  id: 'mindmap',
  label: 'Mindmap',
  layout: {
    rightColumn: {
      storageKey: 'mentis:right-panel-width:mindmap',
      defaultRightPx: 360,
      minRightPx: 280,
    },
    chat: 'index',
  },
  suffixes: ['.map.md'],
  editor: () => import('./editor'),
  appearance: { icon: GitBranch, treeClass: 'text-teal-400/70' },
  search: { read: 'text', reindexOnSave: true },
  createNew: {
    label: 'Mindmap',
    stem: 'Mindmap',
    suffix: '.map.md',
    menu: { icon: GitBranch, accentClass: 'text-teal-500', order: 50 },
    content: () => import('./create'),
  },
  linkable: true,
  openAfterImport: true,
}

export default definition
