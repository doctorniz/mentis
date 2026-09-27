import type { FileTypeDefinition } from '@/core/registries/file-types'

const definition: FileTypeDefinition = {
  id: 'kanban',
  label: 'Kanban board',
  suffixes: ['.kanban'],
  // A markdown file whose frontmatter says `type: kanban` is a board.
  claims: {
    baseType: 'markdown',
    test: async (text) => (await import('./detect')).isKanbanMarkdown(text),
  },
}

export default definition
