import type { FileTypeDefinition } from '@/core/registries/file-types'

const definition: FileTypeDefinition = {
  id: 'mindmap',
  label: 'Mindmap',
  suffixes: ['.mind'],
  editor: () => import('./editor'),
}

export default definition
