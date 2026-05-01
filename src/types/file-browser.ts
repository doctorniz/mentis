export type FbViewMode = 'grid' | 'list'

export type FbSortField = 'name' | 'modifiedAt' | 'size' | 'type'
export type FbSortDir = 'asc' | 'desc'

export interface FbSort {
  field: FbSortField
  dir: FbSortDir
}

export interface FbFilters {
  folder?: string
  /** Only show these file types (empty = all). */
  types?: ('pdf' | 'markdown' | 'canvas' | 'image' | 'video' | 'other')[]
  /** All listed tags must be present on the note. */
  tags?: string[]
}

export interface FbFileItem {
  path: string
  name: string
  type: 'pdf' | 'markdown' | 'canvas' | 'image' | 'video' | 'spreadsheet' | 'other'
  isDirectory: boolean
  size: number
  modifiedAt: string
}
