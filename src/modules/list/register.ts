import { ListChecks } from 'lucide-react'
import type { FileTypeDefinition } from '@/core/registries/file-types'
import { isListNote } from '@/lib/lists/detect'

/** A list: `Name.list.md`, or a note marked `type: list`. Checklist or ordered, see lib/lists. */
const definition: FileTypeDefinition = {
  id: 'list',
  label: 'List',
  suffixes: ['.list.md'],
  claims: { baseType: 'markdown', test: isListNote },
  editor: () => import('./editor'),
  appearance: { icon: ListChecks, treeClass: 'text-emerald-500/70' },
  search: { read: 'text', reindexOnSave: true },
  createNew: {
    label: 'List',
    stem: 'List',
    suffix: '.list.md',
    menu: { icon: ListChecks, accentClass: 'text-emerald-500', order: 45 },
    content: () => import('./create'),
  },
  linkable: true,
}

export default definition
