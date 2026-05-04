'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { cn } from '@/utils/cn'
import type { CalendarEvent } from '@/types/calendar'
import type { TaskItem } from '@/types/tasks'
import { eventOccursOn, toDateStr } from '@/lib/calendar'
import { getEffectiveDueDate } from '@/lib/tasks/recurrence'

// ─── Layout constants ─────────────────────────────────────────────────────────
const HOUR_HEIGHT   = 64   // px per hour
const TOTAL_HEIGHT  = HOUR_HEIGHT * 24
const GUTTER_WIDTH  = 48   // px for the time labels column
const SCROLL_TO_HOUR = 7   // scroll to 7am on mount

const HOURS = Array.from({ length: 24 }, (_, i) => i)

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ─── Color map ────────────────────────────────────────────────────────────────
const COLOR_CLS: Record<string, string> = {
  violet:  'bg-violet-500/20 text-violet-700 dark:text-violet-300 border-l-violet-500',
  sky:     'bg-sky-500/20 text-sky-700 dark:text-sky-300 border-l-sky-500',
  emerald: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-l-emerald-500',
  amber:   'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-l-amber-500',
  rose:    'bg-rose-500/20 text-rose-700 dark:text-rose-300 border-l-rose-500',
  slate:   'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-l-slate-400',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the Sunday that starts the week containing `date`. */
function weekStart(date: Date): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay())
  return d
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

/** Minutes from midnight for a `YYYY-MM-DDTHH:mm` string. */
function minutesFromMidnight(s: string): number {
  if (!s.includes('T')) return 0
  const [, time] = s.split('T')
  if (!time) return 0
  const [h, m] = time.split(':').map(Number) as [number, number]
  return h * 60 + m
}

function fmt12h(minutes: number): string {
  const h   = Math.floor(minutes / 60)
  const m   = minutes % 60
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12  = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function hourLabel(h: number): string {
  if (h === 0)  return '12 AM'
  if (h === 12) return '12 PM'
  return h < 12 ? `${h} AM` : `${h - 12} PM`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface TimedEventBlockProps {
  event: CalendarEvent
  dayIndex: number   // 0-6 (column)
  totalCols: number
  onClick: (ev: CalendarEvent) => void
}

function TimedEventBlock({ event, onClick }: TimedEventBlockProps) {
  const startMin  = minutesFromMidnight(event.start)
  const endMin    = event.end.includes('T')
    ? minutesFromMidnight(event.end)
    : startMin + 60   // default 1 hour if no end time
  const duration  = Math.max(endMin - startMin, 15)  // min 15 min display
  const top       = (startMin / 60) * HOUR_HEIGHT
  const height    = (duration / 60) * HOUR_HEIGHT
  const colorCls  = COLOR_CLS[event.color ?? 'violet'] ?? COLOR_CLS['violet']!

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(event) }}
      style={{ top, height, left: '2px', right: '2px', position: 'absolute' }}
      className={cn(
        'z-10 overflow-hidden rounded-sm border-l-2 px-1.5 py-0.5 text-left transition-opacity hover:opacity-80',
        colorCls,
      )}
    >
      <p className="truncate text-[11px] font-semibold leading-snug">{event.title || 'Untitled'}</p>
      {height >= 32 && (
        <p className="text-[10px] opacity-70 leading-snug">
          {fmt12h(startMin)}
          {event.end.includes('T') ? ` – ${fmt12h(endMin)}` : ''}
        </p>
      )}
      {height >= 48 && event.location && (
        <p className="text-[10px] opacity-60 truncate leading-snug">📍 {event.location}</p>
      )}
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface WeekGridProps {
  referenceDate: Date
  events: CalendarEvent[]
  tasks: TaskItem[]
  dailyNoteDates?: Set<string>
  /** Called when the day-number header is clicked — opens all-day new event */
  onDayClick: (dateStr: string) => void
  /** Called when a time slot is clicked — opens timed new event (YYYY-MM-DDTHH:mm) */
  onTimeSlotClick: (dateTimeStr: string) => void
  onEventClick: (event: CalendarEvent) => void
  onDailyNoteClick?: (dateStr: string) => void
}

/** Snap minutes to nearest 30-min mark, clamped to 00:00–23:00 */
function snapToHalfHour(offsetY: number): string {
  const totalMin   = (offsetY / HOUR_HEIGHT) * 60
  const snapped    = Math.round(totalMin / 30) * 30
  const clamped    = Math.max(0, Math.min(23 * 60, snapped))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function WeekGrid({
  referenceDate,
  events,
  tasks,
  dailyNoteDates,
  onDayClick,
  onTimeSlotClick,
  onEventClick,
  onDailyNoteClick,
}: WeekGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const today     = toDateStr(new Date())
  const now       = new Date()

  const start = useMemo(() => weekStart(referenceDate), [referenceDate])
  const days  = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start])

  // Scroll to SCROLL_TO_HOUR on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = SCROLL_TO_HOUR * HOUR_HEIGHT
    }
  }, [])

  // Current-time indicator position
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const nowTop     = (nowMinutes / 60) * HOUR_HEIGHT
  const isThisWeek = days.some((d) => toDateStr(d) === today)

  const allDayEventsForDate = useCallback(
    (dateStr: string) =>
      events.filter((ev) => ev.allDay && eventOccursOn(ev, dateStr)),
    [events],
  )

  const timedEventsForDate = useCallback(
    (dateStr: string) =>
      events.filter((ev) => !ev.allDay && eventOccursOn(ev, dateStr)),
    [events],
  )

  const tasksForDate = useCallback(
    (dateStr: string) =>
      tasks.filter((t) => {
        if (t.status === 'done' || t.status === 'cancelled') return false
        const eff = getEffectiveDueDate(t)
        return eff ? eff.slice(0, 10) === dateStr : false
      }),
    [tasks],
  )

  // Does any day have all-day events or tasks?
  const hasAllDayRow = days.some((d) => {
    const ds = toDateStr(d)
    return allDayEventsForDate(ds).length > 0 || tasksForDate(ds).length > 0 || (dailyNoteDates?.has(ds) ?? false)
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">

      {/* ── Fixed column headers ─────────────────────────────────────────── */}
      <div className="border-border flex shrink-0 border-b" style={{ paddingLeft: GUTTER_WIDTH }}>
        {days.map((day, i) => {
          const dateStr = toDateStr(day)
          const isToday = dateStr === today
          return (
            <div
              key={i}
              className="border-border flex flex-1 flex-col items-center gap-1 border-r py-2 last:border-r-0"
            >
              <span className="text-fg-muted text-[11px] font-medium">{DAY_HEADERS[day.getDay()]}</span>
              <button
                type="button"
                onClick={() => onDayClick(toDateStr(day))}
                className={cn(
                  'flex size-7 items-center justify-center rounded-full text-sm font-semibold transition-colors',
                  isToday
                    ? 'bg-accent text-accent-fg'
                    : 'text-fg hover:bg-bg-hover',
                )}
              >
                {day.getDate()}
              </button>
            </div>
          )
        })}
      </div>

      {/* ── All-day / task row (fixed, only if needed) ───────────────────── */}
      {hasAllDayRow && (
        <div
          className="border-border flex shrink-0 border-b"
          style={{ paddingLeft: GUTTER_WIDTH }}
        >
          {days.map((day, i) => {
            const dateStr    = toDateStr(day)
            const allDay     = allDayEventsForDate(dateStr)
            const dayTasks   = tasksForDate(dateStr)
            const hasDailyNote = dailyNoteDates?.has(dateStr) ?? false

            return (
              <div
                key={i}
                className="border-border flex flex-1 flex-col gap-0.5 border-r p-1 last:border-r-0"
              >
                {hasDailyNote && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDailyNoteClick?.(dateStr) }}
                    title="Open daily note"
                    className="ml-auto size-2 shrink-0 rounded-full bg-amber-400 hover:opacity-70 dark:bg-amber-500"
                  />
                )}
                {allDay.map((ev) => (
                  <button
                    key={ev.path}
                    type="button"
                    onClick={() => onEventClick(ev)}
                    className={cn(
                      'w-full truncate rounded px-1.5 py-0.5 text-left text-[10px] font-medium transition-opacity hover:opacity-80',
                      COLOR_CLS[ev.color] ?? COLOR_CLS['violet']!,
                    )}
                  >
                    {ev.title || 'Untitled'}
                  </button>
                ))}
                {dayTasks.map((t) => (
                  <div
                    key={t.path}
                    className="bg-bg-tertiary text-fg-secondary w-full truncate rounded px-1.5 py-0.5 text-[10px]"
                  >
                    ○ {t.title}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Scrollable time grid ─────────────────────────────────────────── */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="relative flex" style={{ height: TOTAL_HEIGHT }}>

          {/* Hour gutter */}
          <div
            className="border-border pointer-events-none shrink-0 border-r"
            style={{ width: GUTTER_WIDTH }}
          >
            {HOURS.map((h) => (
              <div
                key={h}
                className="border-border relative border-t"
                style={{ height: HOUR_HEIGHT }}
              >
                {h > 0 && (
                  <span
                    className="text-fg-muted absolute bottom-full right-2 pb-0.5 text-[10px] tabular-nums"
                  >
                    {hourLabel(h)}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Day columns */}
          <div className="relative flex min-w-0 flex-1">
            {days.map((day, i) => {
              const dateStr  = toDateStr(day)
              const isToday  = dateStr === today
              const timedEvs = timedEventsForDate(dateStr)

              return (
                <div
                  key={i}
                  onClick={(e) => {
                    const time = snapToHalfHour(e.nativeEvent.offsetY)
                    onTimeSlotClick(`${dateStr}T${time}`)
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') onDayClick(dateStr) }}
                  className={cn(
                    'border-border relative flex-1 cursor-pointer border-r last:border-r-0',
                    isToday ? 'bg-accent/[0.03]' : 'bg-bg',
                  )}
                  style={{ height: TOTAL_HEIGHT }}
                >
                  {/* Hour lines */}
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      className="border-border absolute inset-x-0 border-t"
                      style={{ top: h * HOUR_HEIGHT }}
                    />
                  ))}

                  {/* Half-hour lines (lighter) */}
                  {HOURS.map((h) => (
                    <div
                      key={`h${h}`}
                      className="border-border/40 absolute inset-x-0 border-t"
                      style={{ top: h * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                    />
                  ))}

                  {/* Timed events */}
                  {timedEvs.map((ev) => (
                    <TimedEventBlock
                      key={ev.path}
                      event={ev}
                      dayIndex={i}
                      totalCols={7}
                      onClick={(e) => { onEventClick(e) }}
                    />
                  ))}
                </div>
              )
            })}

            {/* Current time indicator — spans full grid width */}
            {isThisWeek && (
              <div
                className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
                style={{ top: nowTop }}
              >
                <div className="bg-rose-500 size-2 shrink-0 rounded-full" />
                <div className="bg-rose-500/70 h-px flex-1" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
