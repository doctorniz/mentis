import { CalendarPlus } from 'lucide-react'
import type { CaptureDestination, ParseResult } from '@/core/registries/capture'
import { CaptureText, extractExplicitDate } from '@/core/capture/parse'
import { extractNaturalDate, preloadDates } from '@/core/capture/dates'
import { formatLocalDate } from '@/lib/tasks/recurrence'
import type { CalendarEvent } from '@/types/calendar'

const pad = (n: number) => String(n).padStart(2, '0')
/** Local `YYYY-MM-DDTHH:mm`, the calendar's stored form. */
const localDateTime = (d: Date) =>
  `${formatLocalDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`

function nextHour(now: Date): Date {
  const d = new Date(now)
  d.setHours(d.getHours() + 1, 0, 0, 0)
  return d
}

function onDay(day: string, clock: Date): Date {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d, clock.getHours(), clock.getMinutes())
}

const plusHour = (d: Date) => new Date(d.getTime() + 60 * 60 * 1000)

/**
 * Starts / Ends / All day from the input. An explicit `>date` sets the day
 * and only a time of day is then read from the text; a phrase that names a
 * day as well stays in the title whole. Otherwise chrono reads the whole phrase, times and
 * ranges included. With no date the event starts at the next hour. Location
 * is never parsed: it stays in the title.
 */
async function parseEvent(input: string, now: Date, natural: boolean): Promise<ParseResult> {
  const text = new CaptureText(input)
  // Weekday phrases are left to chrono: `next tuesday` said on a Tuesday means next week's.
  const explicitDay = extractExplicitDate(text, now, 'start')
  const found = natural
    ? await extractNaturalDate(
        text,
        {
          time: true,
          range: true,
          accept: (r) => !explicitDay || !r.start.isCertain('day'),
        },
        'start',
        now,
      )
    : undefined

  const r = found?.result
  const timed = r?.start.isCertain('hour') ?? false
  let allDay = false
  let start: Date
  let end: Date
  if (r && timed) {
    start = explicitDay ? onDay(explicitDay, r.start.date()) : r.start.date()
    end = r.end?.isCertain('hour') ? r.end.date() : plusHour(start)
    if (explicitDay && r.end?.isCertain('hour')) end = onDay(explicitDay, r.end.date())
  } else if (r?.end) {
    // A span of days with no time: an all-day event across them.
    allDay = true
    start = r.start.date()
    end = r.end.date()
  } else {
    const day = explicitDay ?? (r ? formatLocalDate(r.start.date()) : undefined)
    start = day ? onDay(day, nextHour(now)) : nextHour(now)
    end = plusHour(start)
  }

  return {
    values: {
      title: text.residual(),
      allDay,
      start: allDay ? formatLocalDate(start) : localDateTime(start),
      end: allDay ? formatLocalDate(end) : localDateTime(end),
      location: '',
      repeat: 'none',
      alert: '15',
    },
    matchedSpans: text.spans,
    residual: text.residual(),
  }
}

const REPEAT_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Every week' },
  { value: 'monthly', label: 'Every month' },
  { value: 'yearly', label: 'Every year' },
]

const ALERT_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: '0', label: 'At the start' },
  { value: '5', label: '5 minutes before' },
  { value: '15', label: '15 minutes before' },
  { value: '30', label: '30 minutes before' },
  { value: '60', label: '1 hour before' },
  { value: '1440', label: '1 day before' },
]

const day = (v: unknown) => String(v ?? '').slice(0, 10)

/** An event in `_mentis/_calendar/`. Always confirmed: dates are the riskiest parse. */
export const calendarDestination: CaptureDestination = {
  id: 'calendar',
  sigil: '/cal',
  aliases: ['/event', '/calendar'],
  label: 'Calendar',
  icon: CalendarPlus,
  hint: 'Dentist next tuesday at 7pm',
  immediate: false,
  residualField: 'title',
  preload: preloadDates,
  parseNow: () => ({ values: {}, matchedSpans: [], residual: '' }),
  parse: (input, { now }) => parseEvent(input, now, true),
  fields: () => [
    { key: 'title', label: 'Title', kind: 'text', required: true },
    { key: 'allDay', label: 'All day', kind: 'toggle' },
    {
      key: 'start',
      label: 'Starts',
      kind: 'datetime',
      required: true,
      dateOnly: (v) => v.allDay === true,
    },
    {
      key: 'end',
      label: 'Ends',
      kind: 'datetime',
      required: true,
      dateOnly: (v) => v.allDay === true,
    },
    { key: 'location', label: 'Location', kind: 'text', placeholder: 'Add a place' },
    {
      key: 'repeat',
      label: 'Repeat',
      kind: 'select',
      options: REPEAT_OPTIONS,
      hint: 'Saved with the event. The calendar does not repeat events yet.',
    },
    {
      key: 'alert',
      label: 'Alert',
      kind: 'select',
      options: ALERT_OPTIONS,
      hint: 'Saved with the event. Alerts are not sent yet.',
    },
  ],
  validate(v) {
    const allDay = v.allDay === true
    const start = allDay ? day(v.start) : String(v.start ?? '')
    const end = allDay ? day(v.end) : String(v.end ?? '')
    return end < start ? 'Ends must be after Starts' : null
  },
  async write(v, { vaultFs }) {
    const title = String(v.title ?? '').trim()
    if (!title) return null
    const allDay = v.allDay === true
    const { useCalendarStore } = await import('@/stores/calendar')
    await useCalendarStore.getState().addEvent(vaultFs, {
      title,
      allDay,
      start: allDay ? day(v.start) : String(v.start),
      end: allDay ? day(v.end) : String(v.end),
      color: 'violet',
      location: String(v.location ?? '').trim() || undefined,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      repeat: v.repeat === 'none' ? undefined : (v.repeat as CalendarEvent['repeat']),
      alert: v.alert === 'none' || v.alert == null ? undefined : Number(v.alert),
    })
    window.dispatchEvent(new CustomEvent('ink:vault-changed'))
    return {
      message: `Added to Calendar · ${allDay ? day(v.start) : String(v.start).replace('T', ' ')}`,
    }
  },
}
