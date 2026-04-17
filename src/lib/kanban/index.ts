import matter from 'gray-matter'
import type { KanbanBoard, KanbanColumn, KanbanCard, KanbanColumnColor } from '@/types/kanban'

const CARD_RE = /^-\s+\[([ xX])\]\s+(.*)$/
/** `## Title` or `## Title <!--kanban:amber-->` */
const H2_COLOR_RE = /^##\s+(.+?)\s*(?:<!--\s*kanban:([\w-]+)\s*-->)?\s*$/

const VALID_COLORS = new Set<string>([
  'slate',
  'amber',
  'sky',
  'emerald',
  'violet',
  'rose',
  'zinc',
])

export function parseKanban(raw: string): { board: KanbanBoard; frontmatter: Record<string, unknown> } {
  const { data, content } = matter(raw)

  const columns: KanbanColumn[] = []
  let current: KanbanColumn | null = null

  for (const line of content.split('\n')) {
    const trimmed = line.trimEnd()

    if (trimmed.startsWith('## ')) {
      const hm = H2_COLOR_RE.exec(trimmed)
      const heading = hm ? hm[1].trim() : trimmed.slice(3).trim()
      const rawColor = hm?.[2]
      const color =
        rawColor && VALID_COLORS.has(rawColor) ? (rawColor as KanbanColumnColor) : undefined
      current = {
        id: crypto.randomUUID(),
        heading,
        color,
        cards: [],
      }
      columns.push(current)
      continue
    }

    if (!current) continue

    const m = CARD_RE.exec(trimmed)
    if (m) {
      current.cards.push({
        id: crypto.randomUUID(),
        title: m[2].trim(),
        checked: m[1] !== ' ',
      })
    }
  }

  return { board: { columns }, frontmatter: data }
}

export function serializeKanban(
  board: KanbanBoard,
  frontmatter: Record<string, unknown>,
): string {
  const fm = { ...frontmatter, type: 'kanban', modified: new Date().toISOString() }
  const body = board.columns
    .map((col) => {
      const colorSuffix =
        col.color && VALID_COLORS.has(col.color) ? ` <!--kanban:${col.color}-->` : ''
      const heading = `## ${col.heading}${colorSuffix}`
      const cards = col.cards
        .map((c) => `- [${c.checked ? 'x' : ' '}] ${c.title}`)
        .join('\n')
      return cards ? `${heading}\n\n${cards}` : heading
    })
    .join('\n\n')

  return matter.stringify(`\n${body}\n`, fm)
}

const DEFAULT_COLUMNS = ['To Do', 'In Progress', 'Done'] as const
const DEFAULT_COLUMN_COLORS: KanbanColumnColor[] = ['amber', 'sky', 'emerald']

export function createEmptyKanban(columns?: string[]): string {
  const headings = columns ?? [...DEFAULT_COLUMNS]
  const board: KanbanBoard = {
    columns: headings.map((heading, i) => ({
      id: crypto.randomUUID(),
      heading,
      color: DEFAULT_COLUMN_COLORS[i % DEFAULT_COLUMN_COLORS.length],
      cards: [],
    })),
  }
  const frontmatter: Record<string, unknown> = {
    type: 'kanban',
    created: new Date().toISOString(),
  }
  return serializeKanban(board, frontmatter)
}

export function isKanbanFile(raw: string): boolean {
  const { data } = matter(raw)
  return data.type === 'kanban'
}
