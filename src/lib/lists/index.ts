import matter from 'gray-matter'
import { formatLocalDate } from '@/lib/tasks/recurrence'

/**
 * Lists: one markdown file per list, `Name.list.md`.
 *
 *     ---
 *     type: list
 *     kind: checklist          # or ordered
 *     reset: weekly            # optional, checklists: daily | weekly | monthly
 *     lastReset: 2026-10-06
 *     ---
 *     - [ ] Milk
 *       2 × semi-skimmed       ← the item's note: indented lines under it
 *     - [x] Bread
 *
 * Ordered lists use `1. [ ] Step`. The title is the file name. Frontmatter
 * this does not know, and text that is not an item, are kept as they were,
 * so a hand-edited list survives being opened here.
 */

export const LISTS_DIR = '_mentis/_lists'
export const LIST_SUFFIX = '.list.md'

export type ListKind = 'checklist' | 'ordered'
export type ListReset = 'daily' | 'weekly' | 'monthly'

export interface ListItem {
  /** For rendering and moving items; not stored. */
  id: string
  text: string
  done: boolean
  /** Detail or quantity, possibly several lines. */
  note: string
}

export interface ListDoc {
  kind: ListKind
  reset?: ListReset
  /** YYYY-MM-DD of the last scheduled reset. */
  lastReset?: string
  items: ListItem[]
  /** Frontmatter other than the keys above, kept as found. */
  extraFrontmatter: Record<string, unknown>
  /** Text before the first item, kept as found. */
  preamble: string
  /** Text after the first item that is neither an item nor a note, kept (after the items). */
  trailer: string
}

const ITEM_RE = /^(?:[-*+]|\d+[.)])\s+(?:\[( |x|X)\]\s+)?(.*)$/
const RESETS: readonly ListReset[] = ['daily', 'weekly', 'monthly']

let counter = 0
const newId = () => `li-${Date.now().toString(36)}-${(counter++).toString(36)}`

export function newItem(text: string, note = ''): ListItem {
  return { id: newId(), text, done: false, note }
}

export function emptyList(kind: ListKind = 'checklist'): ListDoc {
  return { kind, items: [], extraFrontmatter: {}, preamble: '', trailer: '' }
}

/** The list's title: its file name without `.list.md`. */
export function listTitle(path: string): string {
  const name = path.split('/').pop() ?? path
  return name.toLowerCase().endsWith(LIST_SUFFIX) ? name.slice(0, -LIST_SUFFIX.length) : name
}

export function isListPath(path: string): boolean {
  return path.toLowerCase().endsWith(LIST_SUFFIX)
}

export function parseList(raw: string): ListDoc {
  const { data, content } = matter(raw)
  const fm = { ...(data as Record<string, unknown>) }
  const kind: ListKind = fm.kind === 'ordered' ? 'ordered' : 'checklist'
  const reset = RESETS.includes(fm.reset as ListReset) ? (fm.reset as ListReset) : undefined
  const lastReset =
    fm.lastReset instanceof Date
      ? formatLocalDate(fm.lastReset)
      : typeof fm.lastReset === 'string'
        ? fm.lastReset
        : undefined
  for (const k of ['type', 'kind', 'reset', 'lastReset']) delete fm[k]

  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const items: ListItem[] = []
  const preamble: string[] = []
  const trailer: string[] = []
  for (const line of lines) {
    const m = ITEM_RE.exec(line)
    if (m && !/^\s/.test(line)) {
      items.push({ id: newId(), text: m[2]!.trim(), done: m[1] === 'x' || m[1] === 'X', note: '' })
      continue
    }
    const last = items.at(-1)
    if (last && /^(\s{2,}|\t)\S/.test(line)) {
      last.note = last.note ? `${last.note}\n${line.trim()}` : line.trim()
    } else if (!last) {
      preamble.push(line)
    } else if (line.trim() || trailer.length) {
      trailer.push(line)
    }
  }
  return {
    kind,
    reset,
    lastReset,
    items,
    extraFrontmatter: fm,
    preamble: preamble.join('\n').trim(),
    trailer: trailer.join('\n').trim(),
  }
}

export function serializeList(doc: ListDoc): string {
  const fm: Record<string, unknown> = { type: 'list', kind: doc.kind }
  if (doc.reset) fm.reset = doc.reset
  if (doc.lastReset) fm.lastReset = doc.lastReset
  Object.assign(fm, doc.extraFrontmatter)

  const itemLines = doc.items.flatMap((item, i) => {
    const marker = doc.kind === 'ordered' ? `${i + 1}.` : '-'
    const indent = ' '.repeat(marker.length + 1)
    return [
      `${marker} [${item.done ? 'x' : ' '}] ${item.text}`,
      ...(item.note ? item.note.split('\n').map((l) => `${indent}${l}`) : []),
    ]
  })
  const body = [doc.preamble, itemLines.join('\n'), doc.trailer].filter(Boolean).join('\n\n')
  // A lastReset written as a bare YAML date reads back as a Date; parseList accepts both.
  return matter.stringify(body ? `\n${body}\n` : '\n', fm)
}

/** The first day (YYYY-MM-DD) of the period `now` falls in. Weeks start on Monday. */
export function periodStart(reset: ListReset, now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (reset === 'weekly') d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  if (reset === 'monthly') d.setDate(1)
  return formatLocalDate(d)
}

/**
 * Apply a scheduled reset if a new period has begun since the last one:
 * every item unchecked, `lastReset` moved on. A list with a schedule but no
 * `lastReset` yet starts its count today without unchecking anything.
 * Returns null when nothing changes.
 */
export function applyDueReset(doc: ListDoc, now: Date = new Date()): ListDoc | null {
  if (doc.kind !== 'checklist' || !doc.reset) return null
  const start = periodStart(doc.reset, now)
  if (!doc.lastReset) return { ...doc, lastReset: formatLocalDate(now) }
  if (doc.lastReset >= start) return null
  return {
    ...doc,
    lastReset: formatLocalDate(now),
    items: doc.items.map((i) => ({ ...i, done: false })),
  }
}

export function uncheckAll(doc: ListDoc): ListDoc {
  return { ...doc, items: doc.items.map((i) => ({ ...i, done: false })) }
}

/** The list as plain text for sending to someone: ☐/☑ items, notes after a dash. */
export function listAsText(title: string, doc: ListDoc): string {
  const lines = doc.items.map((item, i) => {
    const box = item.done ? '☑' : '☐'
    const n = doc.kind === 'ordered' ? `${i + 1}. ` : ''
    const note = item.note ? ` — ${item.note.replace(/\n/g, '; ')}` : ''
    return `${n}${box} ${item.text}${note}`
  })
  return [title, '', ...lines].join('\n')
}

/** Add an item to the end of a list's file text, keeping everything else. */
export function appendToList(raw: string, text: string, note = ''): string {
  const doc = parseList(raw)
  doc.items.push(newItem(text, note))
  return serializeList(doc)
}
