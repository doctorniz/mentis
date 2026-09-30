import { Table2 } from 'lucide-react'
import type { FileTypeDefinition } from '@/core/registries/file-types'

const definition: FileTypeDefinition = {
  id: 'spreadsheet',
  label: 'Spreadsheet',
  suffixes: ['.xlsx', '.xls', '.csv'],
  editor: () => import('./editor'),
  layout: {
    narrow: 'wide',
    rightColumn: {
      storageKey: 'mentis:right-panel-width:spreadsheet',
      defaultRightPx: 360,
      minRightPx: 280,
    },
    chat: 'index',
  },
  appearance: {
    icon: Table2,
    treeClass: 'text-green-400/70',
    browser: {
      icon: Table2,
      iconClass: 'text-green-500',
      bgClass: 'bg-green-50 dark:bg-green-950/40',
      inList: false,
    },
  },
  graph: {
    shape: 'rect',
    colors: {
      fill: {
        dark: 'rgba(74,222,128,0.75)',
        light: 'rgba(34,197,94,0.55)',
      },
      hover: {
        dark: '#4ade80',
        light: '#16a34a',
      },
      stroke: {
        dark: '#86efac',
        light: '#15803d',
      },
    },
    iconSvg:
      '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
    count: { singular: 'sheet', plural: 'sheets', order: 6 },
  },
  search: { read: 'bytes' },
  openAfterImport: true,
}

export default definition
