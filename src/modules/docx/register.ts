import { FileType2 } from 'lucide-react'
import type { FileTypeDefinition } from '@/core/registries/file-types'

const definition: FileTypeDefinition = {
  id: 'docx',
  label: 'Word document',
  suffixes: ['.docx'],
  editor: () => import('./editor'),
  layout: { narrow: 'wide' },
  appearance: { icon: FileType2, treeClass: 'text-indigo-400/70' },
  graph: {
    shape: 'rounded-rect',
    colors: {
      fill: {
        dark: 'rgba(129,140,248,0.75)',
        light: 'rgba(99,102,241,0.55)',
      },
      hover: {
        dark: '#818cf8',
        light: '#6366f1',
      },
      stroke: {
        dark: '#a5b4fc',
        light: '#4338ca',
      },
    },
    iconSvg:
      '<path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4"/><polyline points="14 2 14 8 20 8"/><path d="M2 13v-1h6v1"/><path d="M4 18h2"/><path d="M5 12v6"/>',
    count: { singular: 'doc', plural: 'docs', order: 5 },
  },
  search: { read: 'bytes' },
}

export default definition
