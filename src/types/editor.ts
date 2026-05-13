export interface NoteFrontmatter {
  title?: string
  tags?: string[]
  created?: string
  modified?: string
  starred?: boolean
  template?: string
  /**
   * Stable UUID pointing at this note's chat folder under
   * `_marrow/_chats/<chatAssetId>/`. Minted lazily on first chat open
   * and persisted in frontmatter so it travels with the file across
   * renames — same pattern as Canvas v5's `assetId`.
   */
  chatAssetId?: string
  /** Voice clip path (e.g. `_assets/…`) when promoted from the Board. */
  audioPath?: string
  audioDuration?: number
  transcript?: string
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
  type: 'markdown' | 'pdf' | 'canvas' | 'mindmap' | 'image' | 'video' | 'audio' | 'kanban' | 'code' | 'docx' | 'pptx' | 'spreadsheet'
  title: string
  isDirty: boolean
  /** When true, notes editor shows full-file markdown source (incl. frontmatter). */
  showRawSource?: boolean
  /** When true, the title input is auto-focused and selected so the user can rename immediately. */
  isNew?: boolean
}
