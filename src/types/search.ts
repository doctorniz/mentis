export interface SearchResult {
  id: string
  path: string
  title: string
  type: 'markdown' | 'pdf' | 'canvas'
  score: number
  matches: SearchMatch[]
}

export interface SearchMatch {
  field: string
  term: string
  context: string
}

export interface SearchFilters {
  fileType?: ('markdown' | 'pdf' | 'canvas')[]
  folder?: string
  tags?: string[]
  dateRange?: {
    from?: string
    to?: string
  }
}

export interface SearchIndexEntry {
  id: string
  path: string
  title: string
  type: string
  content: string
  tags: string[]
  modifiedAt: string
}
