import { Image as ImageIcon } from 'lucide-react'
import type { FileTypeDefinition } from '@/core/registries/file-types'

const definition: FileTypeDefinition = {
  id: 'image',
  label: 'Image',
  suffixes: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'],
  editor: () => import('./editor'),
  appearance: {
    icon: ImageIcon,
    treeClass: 'text-emerald-400/70',
    browser: {
      icon: ImageIcon,
      iconClass: 'text-emerald-500',
      bgClass: 'bg-emerald-50 dark:bg-emerald-950/40',
      filter: { label: 'Image', order: 4 },
    },
  },
  thumbnail: {
    load: () => import('./thumbnail'),
    inList: true,
    gridFrameClass: 'h-14 w-14 rounded-lg shadow-sm ring-1 ring-black/10 dark:ring-white/10',
  },
}

export default definition
