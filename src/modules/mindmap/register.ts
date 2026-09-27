import { GitBranch } from 'lucide-react'
import type { FileTypeDefinition } from '@/core/registries/file-types'

const definition: FileTypeDefinition = {
  id: 'mindmap',
  label: 'Mindmap',
  suffixes: ['.mind'],
  editor: () => import('./editor'),
  appearance: { icon: GitBranch, treeClass: 'text-teal-400/70' },
  search: { extract: () => import('./search'), reindexOnSave: true },
  createNew: {
    label: 'Mindmap',
    stem: 'Mindmap',
    suffix: '.mind',
    menu: { icon: GitBranch, accentClass: 'text-teal-500', order: 50 },
    content: () => import('./create'),
  },
  openAfterImport: true,
}

export default definition
