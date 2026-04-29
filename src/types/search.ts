export interface SearchResult {
  id: string
  path: string
  title: string
  type: 'markdown' | 'pdf' | 'canvas' | 'spreadsheet'
  score: number
  /** Legacy shape; kept for compatibility. */
  matches: SearchMatch[]
  snippetBefore: string
  snippetHit: string
  snippetAfter: string
}

export interface SearchMatch {
  field: string
  term: string
  context: string
}

export interface SearchFilters {
  fileType?: ('markdown' | 'pdf' | 'canvas' | 'spreadsheet')[]
  /** Path prefix (e.g. `Journal` or `Journal/2026`). */
  folder?: string
  /** All listed tags must be present on the document. */
  tags?: string[]
  dateRange?: {
    from?: string
    to?: string
  }
}

/** Document stored in MiniSearch (field names are index keys). */
export interface SearchIndexDocument {
  id: string
  path: string
  title: string
  fileType: 'markdown' | 'pdf' | 'canvas' | 'spreadsheet'
  content: string
  /** Space-separated tags for the indexed `tags` field. */
  tags: string
  /** Comma-separated lowercase tags for filtering. */
  tagCsv: string
  modifiedAt: string
}
