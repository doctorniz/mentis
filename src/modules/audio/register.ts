import type { FileTypeDefinition } from '@/core/registries/file-types'

const definition: FileTypeDefinition = {
  id: 'audio',
  label: 'Audio',
  suffixes: ['.mp3', '.wav', '.m4a', '.aac', '.flac', '.wma'],
}

export default definition
