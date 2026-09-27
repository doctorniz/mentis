import { Presentation } from 'lucide-react'
import type { FileTypeDefinition } from '@/core/registries/file-types'

const definition: FileTypeDefinition = {
  id: 'pptx',
  label: 'Presentation',
  suffixes: ['.pptx'],
  editor: () => import('./editor'),
  layout: { narrow: 'wide' },
  appearance: { icon: Presentation, treeClass: 'text-orange-400/70' },
  graph: {
    shape: 'pentagon',
    colors: {
      fill: {
        dark: 'rgba(251,146,60,0.75)',
        light: 'rgba(249,115,22,0.55)',
      },
      hover: {
        dark: '#fb923c',
        light: '#ea580c',
      },
      stroke: {
        dark: '#fdba74',
        light: '#c2410c',
      },
    },
    iconSvg:
      '<line x1="22" y1="3" x2="2" y2="3"/><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/><path d="m8 21 4-4 4 4"/>',
    count: { singular: 'presentation', plural: 'presentations', order: 4 },
  },
  search: { extract: () => import('./search') },
}

export default definition
