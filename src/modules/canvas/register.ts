import type { FileTypeDefinition } from '@/core/registries/file-types'

const definition: FileTypeDefinition = {
  id: 'canvas',
  label: 'Drawing',
  suffixes: ['.canvas'],
  editor: () => import('./editor'),
  layout: { narrow: 'canvas' },
}

export default definition
