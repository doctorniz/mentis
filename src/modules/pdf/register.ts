import type { FileTypeDefinition } from '@/core/registries/file-types'

const definition: FileTypeDefinition = {
  id: 'pdf',
  label: 'PDF',
  suffixes: ['.pdf'],
  editor: () => import('./editor'),
  layout: {
    rightColumn: {
      storageKey: 'ink-marrow:right-panel-width:pdf',
      defaultRightPx: 420,
      minRightPx: 300,
    },
    chat: 'index',
  },
}

export default definition
