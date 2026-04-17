export interface KanbanCard {
  id: string
  title: string
  checked: boolean
}

/** Preset column accent; persisted as `<!--kanban:slug-->` after `##` heading */
export type KanbanColumnColor =
  | 'slate'
  | 'amber'
  | 'sky'
  | 'emerald'
  | 'violet'
  | 'rose'
  | 'zinc'

export interface KanbanColumn {
  id: string
  heading: string
  /** Optional accent; default columns get distinct colors */
  color?: KanbanColumnColor
  cards: KanbanCard[]
}

export interface KanbanBoard {
  columns: KanbanColumn[]
}
