import { MonitorPlay } from 'lucide-react'
import type { FileTypeDefinition } from '@/core/registries/file-types'

/**
 * Marp slide decks: markdown files named `*.slides.md`. The compound suffix
 * wins over plain `.md` in the registry, so these open here rather than in the
 * note editor.
 */
const definition: FileTypeDefinition = {
  id: 'slides',
  label: 'Slides',
  suffixes: ['.slides.md'],
  editor: () => import('./editor'),
  layout: {
    narrow: 'wide',
    rightColumn: {
      storageKey: 'mentis:right-panel-width:slides',
      defaultRightPx: 360,
      minRightPx: 280,
    },
    chat: 'index',
  },
  appearance: {
    icon: MonitorPlay,
    treeClass: 'text-fuchsia-400/70',
    browser: {
      icon: MonitorPlay,
      iconClass: 'text-fuchsia-500',
      bgClass: 'bg-fuchsia-50 dark:bg-fuchsia-950/40',
    },
  },
  graph: {
    shape: 'hexagon',
    colors: {
      fill: { dark: 'rgba(232,121,249,0.75)', light: 'rgba(217,70,239,0.55)' },
      hover: { dark: '#e879f9', light: '#c026d3' },
      stroke: { dark: '#f0abfc', light: '#a21caf' },
    },
    iconSvg:
      '<path d="M10 7.75a.75.75 0 0 1 1.142-.638l3.664 2.249a.75.75 0 0 1 0 1.278l-3.664 2.25a.75.75 0 0 1-1.142-.64z"/><path d="M12 17v4"/><path d="M8 21h8"/><rect x="2" y="3" width="20" height="14" rx="2"/>',
    count: { singular: 'deck', plural: 'decks', order: 8 },
  },
  search: { read: 'text', reindexOnSave: true },
  createNew: {
    label: 'Slides',
    stem: 'Slides',
    suffix: '.slides.md',
    menu: { icon: MonitorPlay, accentClass: 'text-fuchsia-500', order: 45 },
    content: () => import('./create'),
  },
  linkable: true,
  openAfterImport: true,
}

export default definition
