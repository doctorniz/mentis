import type { FileTypeDefinition } from '@/core/registries/file-types'

const definition: FileTypeDefinition = {
  id: 'docx',
  label: 'Word document',
  suffixes: ['.docx'],
  editor: () => import('./editor'),
  layout: { narrow: 'wide' },
}

export default definition
