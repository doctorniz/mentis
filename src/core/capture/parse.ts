import { formatLocalDate, nextWeekdayOnOrAfter } from '@/lib/tasks/recurrence'
import type { TaskPriority } from '@/types/tasks'

/**
 * Capture's payload modifiers, shared by every destination that has the
 * field: `!1`–`!4` priority, `#tag`, `>token` explicit date, and recurring /
 * single weekday phrases. Natural-language dates (chrono-node) run last, on
 * whatever these leave, in ./dates.
 *
 * Each extractor *claims* the text it used. Claimed text is blanked in a
 * same-length copy, so later extractors cannot see it and every position
 * stays in the input's own coordinates. What is never claimed is the
 * residual — the title or body — so nothing typed is dropped. A field that
 * holds one value claims only the winning match; any other stays in the text.
 */

export interface MatchedSpan {
  start: number
  end: number
  field: string
}

export class CaptureText {
  readonly input: string
  readonly spans: MatchedSpan[] = []
  /** The input padded with a space each side (so `\s`-led patterns match at the edges), claimed text blanked. */
  private padded: string

  constructor(input: string) {
    this.input = input
    this.padded = ` ${input} `
  }

  /** The unclaimed input, claimed text blanked: same length and positions as `input`. */
  get unclaimed(): string {
    return this.padded.slice(1, -1)
  }

  /** Every match of `re` in the padded unclaimed text. Index 0 of the padding is input index -1. */
  matchAll(re: RegExp): RegExpExecArray[] {
    const flags = re.flags.includes('g') ? re.flags : re.flags + 'g'
    return [...this.padded.matchAll(new RegExp(re.source, flags))]
  }

  /** Claim `input[start, end)` for `field`. */
  claim(start: number, end: number, field: string): void {
    this.spans.push({ start, end, field })
    this.padded =
      this.padded.slice(0, start + 1) + ' '.repeat(end - start) + this.padded.slice(end + 1)
  }

  /** The input without claimed text, whitespace collapsed. */
  residual(): string {
    return this.unclaimed.replace(/\s+/g, ' ').trim()
  }
}

/** Input positions of a `\s`-led sigil match (`␠!2`): the sigil, without its leading space. */
function sigilRange(m: RegExpExecArray): [number, number] {
  return [m.index, m.index + m[0].length - 1]
}

/** Input positions of a match with no leading space in the pattern. */
function wholeRange(m: RegExpExecArray): [number, number] {
  return [m.index - 1, m.index - 1 + m[0].length]
}

const PRIORITY_RE = /\s!([1-4])\b/g
const TAG_RE = /\s#(\w[\w-]*)/g
const DATE_RE = /\s>(\S+)/g

/** `!1`–`!4`. The last one wins. */
export function extractPriority(text: CaptureText): TaskPriority | undefined {
  const last = text.matchAll(PRIORITY_RE).at(-1)
  if (!last) return undefined
  text.claim(...sigilRange(last), 'priority')
  return Number(last[1]) as TaskPriority
}

/** Every `#tag`, lower-cased, in order. */
export function extractTags(text: CaptureText): string[] {
  const tags: string[] = []
  for (const m of text.matchAll(TAG_RE)) {
    tags.push(m[1]!.toLowerCase())
    text.claim(...sigilRange(m), 'tags')
  }
  return tags
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

/** Long and common short forms → `Date#getDay()` (0 = Sun … 6 = Sat). */
function dayWordToDow(raw: string): number | null {
  const w = raw.toLowerCase().replace(/s$/u, '')
  if (w.length < 3) return null
  for (let i = 0; i < DAY_NAMES.length; i++) {
    const name = DAY_NAMES[i]!
    if (w === name || name.startsWith(w)) return i
  }
  return null
}

/** A `>token` date: today, tomorrow, a weekday, or YYYY-MM-DD. */
export function resolveDateToken(token: string, now: Date = new Date()): string | undefined {
  const lower = token.toLowerCase()
  if (lower === 'today') return formatLocalDate(now)
  if (lower === 'tomorrow') {
    const d = new Date(now)
    d.setDate(d.getDate() + 1)
    return formatLocalDate(d)
  }
  const dayIdx = DAY_NAMES.indexOf(lower)
  if (dayIdx !== -1) {
    const diff = (dayIdx - now.getDay() + 7) % 7
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    d.setDate(d.getDate() + diff)
    return formatLocalDate(d)
  }
  if (ISO_RE.test(token)) return token
  return undefined
}

/**
 * `>token` dates. The last one that resolves wins; one that does not resolve
 * is not a date, so it stays in the text.
 */
export function extractExplicitDate(text: CaptureText, now?: Date): string | undefined {
  let winner: { m: RegExpExecArray; date: string } | undefined
  for (const m of text.matchAll(DATE_RE)) {
    const date = resolveDateToken(m[1]!, now)
    if (date) winner = { m, date }
  }
  if (!winner) return undefined
  text.claim(...sigilRange(winner.m), 'due')
  return winner.date
}

const RECURRING_RES: RegExp[] = [
  /\b(?:every|each)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
  /\b(?:on)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s\b/gi,
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s\b/gi,
]

const SINGULAR_DAY_RE =
  /\b(?:on|this|next)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi

export interface Recurrence {
  repeat: 'weekly'
  repeatWeekday: number
}

/**
 * `every monday`, `on mondays`, `mondays`. Earlier patterns take precedence
 * over a later one matching inside them (`on mondays` over `mondays`); of
 * the phrases left, the last in the text wins.
 */
export function extractRecurrence(text: CaptureText): Recurrence | undefined {
  const found: { range: [number, number]; dow: number }[] = []
  for (const re of RECURRING_RES) {
    for (const m of text.matchAll(re)) {
      const dow = dayWordToDow(m[1]!)
      const range = wholeRange(m)
      const overlaps = found.some((f) => range[0] < f.range[1] && f.range[0] < range[1])
      if (dow != null && !overlaps) found.push({ range, dow })
    }
  }
  const winner = found.sort((a, b) => a.range[0] - b.range[0]).at(-1)
  if (!winner) return undefined
  text.claim(...winner.range, 'repeat')
  return { repeat: 'weekly', repeatWeekday: winner.dow }
}

/** `on monday`, `this friday`, `next tuesday`: the next such day. The first phrase wins. */
export function extractWeekday(text: CaptureText, now: Date = new Date()): string | undefined {
  for (const m of text.matchAll(SINGULAR_DAY_RE)) {
    const dow = dayWordToDow(m[1]!)
    if (dow == null) continue
    text.claim(...wholeRange(m), 'due')
    return formatLocalDate(nextWeekdayOnOrAfter(now, dow))
  }
  return undefined
}
