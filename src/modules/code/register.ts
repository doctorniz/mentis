import { FileCode2 } from 'lucide-react'
import type { FileTypeDefinition } from '@/core/registries/file-types'

const definition: FileTypeDefinition = {
  id: 'code',
  label: 'Code',
  suffixes: [
    '.html',
    '.htm',
    '.css',
    '.scss',
    '.less',
    '.js',
    '.mjs',
    '.cjs',
    '.jsx',
    '.ts',
    '.tsx',
    '.mts',
    '.cts',
    '.py',
    '.json',
    '.yaml',
    '.yml',
    '.toml',
    '.xml',
    '.sh',
    '.bash',
    '.zsh',
    '.bat',
    '.ps1',
    '.sql',
    '.graphql',
    '.gql',
    '.env',
    '.ini',
    '.conf',
    '.cfg',
    '.log',
    '.txt',
  ],
  editor: () => import('./editor'),
  appearance: { icon: FileCode2, treeClass: 'text-sky-400/70' },
  graph: {
    shape: 'circle',
    colors: {
      fill: {
        dark: 'rgba(56,189,248,0.75)',
        light: 'rgba(14,165,233,0.55)',
      },
      hover: {
        dark: '#38bdf8',
        light: '#0284c7',
      },
      stroke: {
        dark: '#7dd3fc',
        light: '#0369a1',
      },
    },
    iconSvg:
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="m10 13-2 2 2 2"/><path d="m14 17 2-2-2-2"/>',
    count: { singular: 'code file', plural: 'code files', order: 7 },
  },
  search: { read: 'text', reindexOnSave: true },
  keepExtensionInTitle: true,
}

export default definition
