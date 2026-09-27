import matter from 'gray-matter'

/** Same rule the old detectEditorTabType used: frontmatter `type: kanban`. */
export function isKanbanMarkdown(text: string): boolean {
  return matter(text).data.type === 'kanban'
}
