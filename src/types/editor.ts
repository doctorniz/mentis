export interface NoteFrontmatter {
  title?: string
  tags?: string[]
  created?: string
  modified?: string
  starred?: boolean
  template?: string
  [key: string]: unknown
}

export interface NoteDocument {
  path: string
  frontmatter: NoteFrontmatter
  content: string
  rawContent: string
}

export interface WikiLink {
  target: string
  alias?: string
  pageRef?: string
}

export interface Backlink {
  sourcePath: string
  sourceTitle: string
  context: string
}

export interface SlashCommand {
  id: string
  label: string
  description: string
  icon: string
  keywords: string[]
  action: () => void
}

export interface EditorTab {
  id: string
  path: string
  type: 'markdown' | 'pdf' | 'canvas' | 'image'
  title: string
  isDirty: boolean
  /** When true, notes editor shows full-file markdown source (incl. frontmatter). */
  showRawSource?: boolean
  /** When true, the title input is auto-focused and selected so the user can rename immediately. */
  isNew?: boolean
}
