import { Music } from 'lucide-react'
import type { FileTypeDefinition } from '@/core/registries/file-types'

const definition: FileTypeDefinition = {
  id: 'audio',
  label: 'Audio',
  suffixes: ['.mp3', '.wav', '.m4a', '.aac', '.flac', '.wma'],
  editor: () => import('./editor'),
  appearance: { icon: Music, treeClass: 'text-pink-400/70' },
  openAfterImport: ['.mp3', '.wav', '.m4a'],
}

export default definition
