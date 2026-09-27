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
  types?: string[]
  /** All listed tags must be present on the note. */
  tags?: string[]
}

export interface FbFileItem {
  path: string
  name: string
  /** File-type registry id, or 'other'. */
  type: string
  isDirectory: boolean
  size: number
  modifiedAt: string
}
