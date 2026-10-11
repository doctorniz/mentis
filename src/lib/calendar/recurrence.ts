import type { CalendarEvent } from '@/types/calendar'
import { parseEventDate, toDateStr, toDateTimeStr } from '@/lib/calendar'

type Repeat = NonNullable<CalendarEvent['repeat']>

/** Days in a month (month 0–11). */
const daysIn = (year: number, month: number) => new Date(year, month + 1, 0).getDate()

/**
 * The `k`th occurrence of a series starting at `start`. Monthly and yearly
 * keep the start's day of the month, falling back to the month's last day
 * (the 31st → the 30th; 29 February → the 28th) when the month is short.
 */
export function nthOccurrence(start: Date, repeat: Repeat, k: number): Date {
  const d = new Date(start)
  if (repeat === 'daily') d.setDate(d.getDate() + k)
  else if (repeat === 'weekly') d.setDate(d.getDate() + 7 * k)
  else {
    const months = repeat === 'monthly' ? k : 12 * k
    const target = new Date(start.getFullYear(), start.getMonth() + months, 1)
    const day = Math.min(start.getDate(), daysIn(target.getFullYear(), target.getMonth()))
    d.setFullYear(target.getFullYear(), target.getMonth(), day)
  }
  return d
}

/** A conservative first index whose occurrence could reach `from`. */
function firstIndexNear(start: Date, repeat: Repeat, from: Date): number {
  const days = (from.getTime() - start.getTime()) / 86_400_000
  if (days <= 0) return 0
  const per = { daily: 1, weekly: 7, monthly: 31, yearly: 366 }[repeat]
  return Math.max(0, Math.floor(days / per) - 1)
}

const MAX_OCCURRENCES = 2000

/**
 * The occurrences of one event that touch [from, to] (YYYY-MM-DD, inclusive).
 * A non-repeating event is itself, if it touches the range. Each occurrence
 * is a copy with its own start and end and the same path, so it opens the
 * series it belongs to.
 */
export function expandEvent(ev: CalendarEvent, from: string, to: string): CalendarEvent[] {
  const start = parseEventDate(ev.start)
  if (!start) return []
  const end = parseEventDate(ev.end || ev.start) ?? start
  const length = Math.max(0, end.getTime() - start.getTime())
  const fmt = (d: Date) => (ev.allDay || ev.start.length <= 10 ? toDateStr(d) : toDateTimeStr(d))
  const touches = (s: Date, e: Date) => toDateStr(e) >= from && toDateStr(s) <= to

  if (!ev.repeat) return touches(start, end) ? [ev] : []

  const rangeStart = parseEventDate(from) ?? start
  const out: CalendarEvent[] = []
  for (let k = firstIndexNear(start, ev.repeat, rangeStart), n = 0; n < MAX_OCCURRENCES; k++, n++) {
    const s = nthOccurrence(start, ev.repeat, k)
    if (toDateStr(s) > to) break
    const e = new Date(s.getTime() + length)
    if (touches(s, e)) out.push(k === 0 ? ev : { ...ev, start: fmt(s), end: ev.end ? fmt(e) : '' })
  }
  return out
}

/** Every occurrence of `events` that touches [from, to], repeating events expanded. */
export function expandEvents(events: CalendarEvent[], from: string, to: string): CalendarEvent[] {
  return events.flatMap((ev) => expandEvent(ev, from, to))
}
