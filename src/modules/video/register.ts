import type { FileTypeDefinition } from '@/core/registries/file-types'

const definition: FileTypeDefinition = {
  id: 'video',
  label: 'Video',
  suffixes: ['.mp4', '.webm', '.ogg', '.mov', '.mkv', '.avi'],
}

export default definition
