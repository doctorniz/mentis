export type BoardItemType = 'thought'
// Future: | 'bookmark' | 'list' | 'reminder' | 'task' | 'audio'

export type ThoughtColor = 'yellow' | 'blue' | 'pink' | 'green' | 'purple' | 'white'

export const THOUGHT_COLORS: ThoughtColor[] = ['yellow', 'blue', 'pink', 'green', 'purple', 'white']

export interface BoardItemFrontmatter {
  type: BoardItemType
  created: string
  modified: string
  color: ThoughtColor
  [key: string]: unknown
}

export interface BoardItem {
  path: string
  type: BoardItemType
  title: string | null
  body: string
  color: ThoughtColor
  created: string
  modified: string
  hasImage: boolean
}
