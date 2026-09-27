import type { FileTypeDefinition } from '@/core/registries/file-types'

const definition: FileTypeDefinition = {
  id: 'pptx',
  label: 'Presentation',
  suffixes: ['.pptx'],
  editor: () => import('./editor'),
  layout: { narrow: 'wide' },
}

export default definition
