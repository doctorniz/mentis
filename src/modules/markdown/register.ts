import type { FileTypeDefinition } from '@/core/registries/file-types'

const definition: FileTypeDefinition = {
  id: 'markdown',
  label: 'Note',
  suffixes: ['.md', '.markdown'],
}

export default definition
