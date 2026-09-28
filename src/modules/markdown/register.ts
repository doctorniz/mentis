import { FileText } from 'lucide-react'
import type { FileTypeDefinition } from '@/core/registries/file-types'

const definition: FileTypeDefinition = {
  id: 'markdown',
  label: 'Note',
  suffixes: ['.md', '.markdown'],
  editor: () => import('./editor'),
  layout: {
    rightColumn: {
      storageKey: 'ink-marrow:right-panel-width:md',
      defaultRightPx: 360,
      minRightPx: 240,
      outline: true,
      backlinks: true,
    },
    chat: 'editor',
  },
  appearance: {
    icon: FileText,
    browser: {
      icon: FileText,
      iconClass: 'text-blue-500',
      bgClass: 'bg-blue-50 dark:bg-blue-950/40',
      filter: { label: 'Notes', order: 2 },
    },
  },
  graph: {
    shape: 'circle',
    colors: {
      fill: {
        dark: 'rgba(148,163,184,0.75)',
        light: 'rgba(100,116,139,0.65)',
      },
      hover: {
        dark: '#60a5fa',
        light: '#3b82f6',
      },
      stroke: {
        dark: '#93c5fd',
        light: '#2563eb',
      },
    },
    iconSvg:
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
    count: { singular: 'note', plural: 'notes', order: 1 },
  },
  search: { extract: () => import('./search'), reindexOnSave: true },
  createNew: {
    label: 'Note',
    stem: 'Note',
    suffix: '.md',
    menu: { icon: FileText, accentClass: 'text-blue-500', order: 10 },
    revealInTree: false,
    content: () => import('./create'),
  },
  renameOnDoubleClick: true,
  linkable: true,
  openAfterImport: true,
}

export default definition
