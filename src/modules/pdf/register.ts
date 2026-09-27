import { FileText, FileType as FileTypeGlyph } from 'lucide-react'
import type { FileTypeDefinition } from '@/core/registries/file-types'

const definition: FileTypeDefinition = {
  id: 'pdf',
  label: 'PDF',
  suffixes: ['.pdf'],
  editor: () => import('./editor'),
  layout: {
    rightColumn: {
      storageKey: 'ink-marrow:right-panel-width:pdf',
      defaultRightPx: 420,
      minRightPx: 300,
    },
    chat: 'index',
  },
  appearance: {
    icon: FileText,
    treeClass: 'text-red-400/70',
    browser: {
      icon: FileTypeGlyph,
      iconClass: 'text-red-500',
      bgClass: 'bg-red-50 dark:bg-red-950/40',
      filter: { label: 'Pdf', order: 1 },
    },
  },
  graph: {
    shape: 'rounded-rect',
    colors: {
      fill: {
        dark: 'rgba(252,165,165,0.75)',
        light: 'rgba(239,68,68,0.55)',
      },
      hover: {
        dark: '#f87171',
        light: '#dc2626',
      },
      stroke: {
        dark: '#fca5a5',
        light: '#b91c1c',
      },
    },
    iconSvg:
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
    count: { singular: 'PDF', plural: 'PDFs', order: 2 },
  },
  search: { extract: () => import('./search') },
  thumbnail: {
    load: () => import('./thumbnail'),
    gridFrameClass: 'h-14 w-[42px] rounded shadow-sm ring-1 ring-black/10',
  },
  openAfterImport: true,
}

export default definition
