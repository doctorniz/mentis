import type { TaskPriority } from '@/types/tasks'
import { formatLocalDate, nextWeekdayOnOrAfter } from '@/lib/tasks/recurrence'

export interface QuickAddResult {
  title: string
  priority?: TaskPriority
  tags: string[]
  due?: string
  repeat?: 'weekly'
  repeatWeekday?: number
}

const PRIORITY_RE = /\s!([1-4])\b/g
const TAG_RE = /\s#(\w[\w-]*)/g
const DATE_RE = /\s>(\S+)/g

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

/** Long + common short forms → `Date#getDay()` (0=Sun … 6=Sat). */
function dayWordToDow(raw: string): number | null {
  const w = raw.toLowerCase().replace(/s$/u, '')
  if (w.length < 3) return null
  for (let i = 0; i < DAY_NAMES.length; i++) {
    const name = DAY_NAMES[i]!
    if (w === name || name.startsWith(w)) return i
  }
  return null
}

function resolveDate(token: string): string | undefined {
  const lower = token.toLowerCase()

  if (lower === 'today') {
    return formatLocalDate(new Date())
  }

  if (lower === 'tomorrow') {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return formatLocalDate(d)
  }

  const dayIdx = DAY_NAMES.indexOf(lower)
  if (dayIdx !== -1) {
    const now = new Date()
    const diff = (dayIdx - now.getDay() + 7) % 7
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    d.setDate(d.getDate() + diff)
    return formatLocalDate(d)
  }

  if (ISO_RE.test(token)) return token

  return undefined
}

const RECURRING_RES: RegExp[] = [
  /\b(?:every|each)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
  /\b(?:on)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s\b/gi,
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s\b/gi,
]

const SINGULAR_DAY_RE =
  /\b(?:on|this|next)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi

function stripRecurringAndSingularDates(text: string): {
  text: string
  repeat?: 'weekly'
  repeatWeekday?: number
  singularDue?: string
} {
  let t = text
  let repeat: 'weekly' | undefined
  let repeatWeekday: number | undefined

  for (const re of RECURRING_RES) {
    re.lastIndex = 0
    t = t.replace(re, (_full, day: string) => {
      const dow = dayWordToDow(day)
      if (dow != null) {
        repeat = 'weekly'
        repeatWeekday = dow
      }
      return ' '
    })
  }

  let singularDue: string | undefined
  if (!repeat) {
    SINGULAR_DAY_RE.lastIndex = 0
    t = t.replace(SINGULAR_DAY_RE, (_full, day: string) => {
      const dow = dayWordToDow(day)
      if (dow != null) {
        singularDue = formatLocalDate(nextWeekdayOnOrAfter(new Date(), dow))
      }
      return ' '
    })
  }

  return { text: t, repeat, repeatWeekday, singularDue }
}

export function parseQuickAdd(input: string): QuickAddResult {
  let text = ` ${input} `
  const tags: string[] = []
  let priority: TaskPriority | undefined
  let due: string | undefined

  let m: RegExpExecArray | null

  PRIORITY_RE.lastIndex = 0
  while ((m = PRIORITY_RE.exec(text))) {
    priority = Number(m[1]) as TaskPriority
  }
  text = text.replace(PRIORITY_RE, ' ')

  TAG_RE.lastIndex = 0
  while ((m = TAG_RE.exec(text))) {
    tags.push(m[1]!.toLowerCase())
  }
  text = text.replace(TAG_RE, ' ')

  DATE_RE.lastIndex = 0
  while ((m = DATE_RE.exec(text))) {
    const resolved = resolveDate(m[1]!)
    if (resolved) due = resolved
  }
  text = text.replace(DATE_RE, ' ')

  const explicitDue = due

  const nl = stripRecurringAndSingularDates(text)
  text = nl.text

  const repeat = nl.repeat
  const repeatWeekday = nl.repeatWeekday

  if (repeat === 'weekly' && repeatWeekday != null) {
    due =
      explicitDue ??
      formatLocalDate(nextWeekdayOnOrAfter(new Date(), repeatWeekday))
  } else if (!explicitDue && nl.singularDue) {
    due = nl.singularDue
  } else {
    due = explicitDue
  }

  const title = text.replace(/\s+/g, ' ').trim()

  return repeat === 'weekly' && repeatWeekday != null
    ? { title, priority, tags, due, repeat, repeatWeekday }
    : { title, priority, tags, due }
}
