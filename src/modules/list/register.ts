import { ListChecks } from 'lucide-react'
import type { FileTypeDefinition } from '@/core/registries/file-types'

/** A list (`Name.list.md`): checklist or ordered, see lib/lists. */
const definition: FileTypeDefinition = {
  id: 'list',
  label: 'List',
  suffixes: ['.list.md'],
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
