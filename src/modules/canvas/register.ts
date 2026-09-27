import { Layout, LayoutGrid } from 'lucide-react'
import type { FileTypeDefinition } from '@/core/registries/file-types'

const definition: FileTypeDefinition = {
  id: 'canvas',
  label: 'Drawing',
  suffixes: ['.canvas'],
  editor: () => import('./editor'),
  layout: { narrow: 'canvas' },
  appearance: {
    icon: Layout,
    treeClass: 'text-violet-400/70',
    browser: {
      icon: LayoutGrid,
      iconClass: 'text-violet-500',
      bgClass: 'bg-violet-50 dark:bg-violet-950/40',
      filter: { label: 'Canvas', order: 3 },
    },
  },
  graph: {
    shape: 'diamond',
    colors: {
      fill: {
        dark: 'rgba(196,181,253,0.75)',
        light: 'rgba(139,92,246,0.55)',
      },
      hover: {
        dark: '#c084fc',
        light: '#7c3aed',
      },
      stroke: {
        dark: '#d8b4fe',
        light: '#6d28d9',
      },
    },
    iconSvg:
      '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>',
    count: { singular: 'drawing', plural: 'drawings', order: 3 },
  },
  search: {},
  createNew: {
    label: 'Canvas',
    stem: 'Drawing',
    suffix: '.canvas',
    menu: { icon: Layout, accentClass: 'text-violet-500', order: 30 },
    content: () => import('./create'),
  },
  openAfterImport: true,
}

export default definition
