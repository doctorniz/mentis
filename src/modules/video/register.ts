import { Film } from 'lucide-react'
import type { FileTypeDefinition } from '@/core/registries/file-types'

const definition: FileTypeDefinition = {
  id: 'video',
  label: 'Video',
  suffixes: ['.mp4', '.webm', '.ogg', '.mov', '.mkv', '.avi'],
  editor: () => import('./editor'),
  appearance: { icon: Film, treeClass: 'text-cyan-400/70' },
}

export default definition
