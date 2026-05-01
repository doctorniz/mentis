export type BoardItemType = 'thought' | 'audio'
// Future: | 'bookmark' | 'list' | 'reminder' | 'task'

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
  /** Vault-relative path to the audio asset (for type === 'audio'). */
  audioPath: string | null
  /** Duration in seconds (for type === 'audio'). */
  audioDuration: number | null
  /** Transcript text from speech-to-text (for type === 'audio'). */
  transcript: string | null
}
