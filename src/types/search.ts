/** File-type registry id of an indexed document (types that declare search support). */
export type SearchDocFileType = string

export interface SearchResult {
  id: string
  path: string
  title: string
  type: SearchDocFileType
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
  fileType?: SearchDocFileType[]
  /** Path prefix (e.g. `Journal` or `Journal/2026`). */
  folder?: string
  /** All listed tags must be present on the document. */
  tags?: string[]
  dateRange?: {
    from?: string
    to?: string
  }
}
