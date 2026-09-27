import type { FileTypeDefinition } from '@/core/registries/file-types'

const definition: FileTypeDefinition = {
  id: 'image',
  label: 'Image',
  suffixes: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'],
  editor: () => import('./editor'),
}

export default definition
