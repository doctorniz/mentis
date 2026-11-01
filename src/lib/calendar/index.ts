import matter from 'gray-matter'
import type { CalendarEvent, CalendarEventFrontmatter, CalendarEventColor } from '@/types/calendar'

export { calendarDir, isEventPath } from './folder'

const H1_RE = /^#\s+(.+)$/m
const REPEATS = ['daily', 'weekly', 'monthly', 'yearly']

function safeColor(raw: unknown): CalendarEventColor {
  const valid: CalendarEventColor[] = ['violet', 'sky', 'emerald', 'amber', 'rose', 'slate']
  return valid.includes(raw as CalendarEventColor) ? (raw as CalendarEventColor) : 'violet'
}

/**
 * A start or end as written. YAML reads an unquoted `2026-11-03` (or
 * `2026-11-03 09:30:00`) as a Date at that wall-clock time in UTC, so it is
 * turned back into the text a person typed.
 */
/** `created` / `modified`: an ISO string, whichever way YAML read it. */
const stamp = (v: unknown): string =>
  v instanceof Date && !isNaN(v.getTime())
    ? v.toISOString()
    : typeof v === 'string' && v
      ? v
      : new Date().toISOString()

function eventDateField(v: unknown): string {
  if (typeof v === 'string') return v
  if (!(v instanceof Date) || isNaN(v.getTime())) return ''
  const iso = v.toISOString()
  return iso.slice(11, 16) === '00:00' ? iso.slice(0, 10) : iso.slice(0, 16)
}

export function parseCalendarEvent(path: string, raw: string): CalendarEvent {
  const { data, content } = matter(raw)
  const fm = data as Partial<CalendarEventFrontmatter>
  const h1 = H1_RE.exec(content)
  const bodyWithoutH1 = content.replace(/^#\s+.+\n?/, '').trim()

  const location = typeof fm.location === 'string' && fm.location ? fm.location : undefined
  const url = typeof fm.url === 'string' && fm.url ? fm.url : undefined
  const tz = typeof fm.tz === 'string' && fm.tz ? fm.tz : undefined
  const repeat = REPEATS.includes(fm.repeat as never)
    ? (fm.repeat as CalendarEventFrontmatter['repeat'])
    : undefined
  const alert = typeof fm.alert === 'number' && fm.alert >= 0 ? fm.alert : undefined
  const reminderAck = typeof fm.reminderAck === 'string' && fm.reminderAck ? fm.reminderAck : undefined
  const snoozeUntil = typeof fm.snoozeUntil === 'string' && fm.snoozeUntil ? fm.snoozeUntil : undefined

  return {
    path,
    uid: (fm.uid as string) ?? '',
    title: h1 ? h1[1].trim() : '',
    body: bodyWithoutH1,
    start: eventDateField(fm.start),
    end: eventDateField(fm.end),
    allDay: Boolean(fm.allDay),
    color: safeColor(fm.color),
    ...(location ? { location } : {}),
    ...(url ? { url } : {}),
    ...(tz ? { tz } : {}),
    ...(repeat ? { repeat } : {}),
    ...(alert != null ? { alert } : {}),
    ...(reminderAck ? { reminderAck } : {}),
    ...(snoozeUntil ? { snoozeUntil } : {}),
    created: stamp(fm.created),
    modified: stamp(fm.modified),
  }
}

function yamlSafe(fm: CalendarEventFrontmatter): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fm as Record<string, unknown>).filter(([, v]) => v !== undefined),
  )
}

export function serializeCalendarEvent(
  fm: CalendarEventFrontmatter,
  title: string,
  body: string,
): string {
  const updated = { ...fm, modified: new Date().toISOString() }
  const mdBody = title ? `\n# ${title}\n${body ? `\n${body}\n` : ''}` : body ? `\n${body}\n` : '\n'
  return matter.stringify(mdBody, yamlSafe(updated))
}

/**
 * An event's file name: its start day, then its title —
 * `2026-11-03 Dentist.md`. Characters a file or a wiki-link cannot hold are dropped.
 */
export function eventFilename(title: string, start: string): string {
  const stem = title
    .replace(/[/\\:*?"<>|#^[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .replace(/[.\s]+$/, '')
  return `${[start.slice(0, 10), stem].filter(Boolean).join(' ') || 'Event'}.md`
}

/** True when `path` is already named for the event (`name.md`, or `name 2.md` after a clash). */
export function hasEventFilename(path: string, title: string, start: string): boolean {
  const base = path.slice(path.lastIndexOf('/') + 1)
  const stem = eventFilename(title, start).slice(0, -3)
  return base === `${stem}.md` || (base.startsWith(`${stem} `) && /^ \d+\.md$/.test(base.slice(stem.length)))
}

export function generateEventUid(): string {
  return crypto.randomUUID()
}

export function defaultEventFrontmatter(
  overrides?: Partial<CalendarEventFrontmatter>,
): CalendarEventFrontmatter {
  const now = new Date().toISOString()
  const base: CalendarEventFrontmatter = {
    uid: generateEventUid(),
    start: '',
    end: '',
    allDay: true,
    color: 'violet',
    created: now,
    modified: now,
  }
  if (!overrides) return base
  return {
    ...base,
    ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined)),
  } as CalendarEventFrontmatter
}

/** Pad a number to 2 digits */
function p(n: number) {
  return String(n).padStart(2, '0')
}

/** Format a Date as YYYY-MM-DD */
export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Format a Date as YYYY-MM-DDTHH:mm */
export function toDateTimeStr(d: Date): string {
  return `${toDateStr(d)}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Parse `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm` to local Date */
export function parseEventDate(s: string): Date | null {
  if (!s) return null
  const dt = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(s.trim())
  if (!dt) return null
  const [, y, mo, d, h, mi] = dt
  return new Date(Number(y), Number(mo) - 1, Number(d), h ? Number(h) : 0, mi ? Number(mi) : 0)
}

/** Returns `YYYY-MM-DD` portion of the event start */
export function eventStartDate(ev: CalendarEvent): string {
  return ev.start.slice(0, 10)
}

/** Returns `YYYY-MM-DD` portion of the event end */
export function eventEndDate(ev: CalendarEvent): string {
  return (ev.end || ev.start).slice(0, 10)
}

/** True when an event spans (or starts on) a given YYYY-MM-DD date cell. */
export function eventOccursOn(ev: CalendarEvent, dateStr: string): boolean {
  const s = eventStartDate(ev)
  const e = eventEndDate(ev)
  return dateStr >= s && dateStr <= e
}
