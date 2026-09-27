import type { FileTypeDefinition } from '@/core/registries/file-types'

const definition: FileTypeDefinition = {
  id: 'markdown',
  label: 'Note',
  suffixes: ['.md', '.markdown'],
  editor: () => import('./editor'),
  layout: {
    rightColumn: {
      storageKey: 'ink-marrow:right-panel-width:md',
      defaultRightPx: 360,
      minRightPx: 240,
      outline: true,
      backlinks: true,
    },
    chat: 'editor',
  },
}

export default definition
