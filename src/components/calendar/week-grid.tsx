'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { cn } from '@/utils/cn'
import type { CalendarEvent } from '@/types/calendar'
import type { TaskItem } from '@/types/tasks'
import { eventOccursOn, toDateStr } from '@/lib/calendar'
import { getEffectiveDueDate } from '@/lib/tasks/recurrence'

// ─── Layout constants ─────────────────────────────────────────────────────────
const HOUR_HEIGHT = 64 // px per hour
const TOTAL_HEIGHT = HOUR_HEIGHT * 24
const GUTTER_WIDTH = 48 // px for the time labels column
const SCROLL_TO_HOUR = 7 // scroll to 7am on mount

/** Same template for header rows + hourly body so borders line up across the week. */
const GRID_TRACKS = `${GUTTER_WIDTH}px repeat(7, minmax(0, 1fr))` as const

const HOURS = Array.from({ length: 24 }, (_, i) => i)

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ─── Color map ────────────────────────────────────────────────────────────────
const COLOR_CLS: Record<string, string> = {
  violet: 'bg-violet-500/20 text-violet-700 dark:text-violet-300 border-l-violet-500',
  sky: 'bg-sky-500/20 text-sky-700 dark:text-sky-300 border-l-sky-500',
  emerald: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-l-emerald-500',
  amber: 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-l-amber-500',
  rose: 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border-l-rose-500',
  slate: 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-l-slate-400',
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
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function hourLabel(h: number): string {
  if (h === 0) return '12 AM'
  if (h === 12) return '12 PM'
  return h < 12 ? `${h} AM` : `${h - 12} PM`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface TimedEventBlockProps {
  event: CalendarEvent
  onClick: (ev: CalendarEvent) => void
}

function TimedEventBlock({ event, onClick }: TimedEventBlockProps) {
  const startMin = minutesFromMidnight(event.start)
  const endMin = event.end.includes('T')
    ? minutesFromMidnight(event.end)
    : startMin + 60 // default 1 hour if no end time
  const duration = Math.max(endMin - startMin, 15) // min 15 min display
  const top = (startMin / 60) * HOUR_HEIGHT
  const height = (duration / 60) * HOUR_HEIGHT
  const colorCls = COLOR_CLS[event.color ?? 'violet'] ?? COLOR_CLS['violet']!

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick(event)
      }}
      style={{ top, height, left: '2px', right: '2px', position: 'absolute' }}
      className={cn(
        'z-10 overflow-hidden rounded-sm border-l-2 px-1.5 py-0.5 text-left transition-opacity hover:opacity-80',
        colorCls,
      )}
    >
      <p className="truncate text-[11px] leading-snug font-semibold">{event.title || 'Untitled'}</p>
      {height >= 32 && (
        <p className="text-[10px] leading-snug opacity-70">
          {fmt12h(startMin)}
          {event.end.includes('T') ? ` – ${fmt12h(endMin)}` : ''}
        </p>
      )}
      {height >= 48 && event.location && (
        <p className="truncate text-[10px] leading-snug opacity-60">📍 {event.location}</p>
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
  const totalMin = (offsetY / HOUR_HEIGHT) * 60
  const snapped = Math.round(totalMin / 30) * 30
  const clamped = Math.max(0, Math.min(23 * 60, snapped))
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
  const today = toDateStr(new Date())
  const now = new Date()

  const start = useMemo(() => weekStart(referenceDate), [referenceDate])
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start])

  // Scroll to SCROLL_TO_HOUR on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = SCROLL_TO_HOUR * HOUR_HEIGHT
    }
  }, [])

  // Current-time indicator position
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const nowTop = (nowMinutes / 60) * HOUR_HEIGHT
  const isThisWeek = days.some((d) => toDateStr(d) === today)

  const allDayEventsForDate = useCallback(
    (dateStr: string) => events.filter((ev) => ev.allDay && eventOccursOn(ev, dateStr)),
    [events],
  )

  const timedEventsForDate = useCallback(
    (dateStr: string) => events.filter((ev) => !ev.allDay && eventOccursOn(ev, dateStr)),
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

  const hasAllDayRow = days.some((d) => {
    const ds = toDateStr(d)
    return (
      allDayEventsForDate(ds).length > 0
      || tasksForDate(ds).length > 0
      || (dailyNoteDates?.has(ds) ?? false)
    )
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        ref={scrollRef}
        className="border-border bg-bg min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
      >
        <div className="bg-bg border-border sticky top-0 z-30 border-b">
          <div className="border-border grid" style={{ gridTemplateColumns: GRID_TRACKS }}>
            <div className="border-border border-r" aria-hidden />
            {days.map((day, i) => {
              const dateStr = toDateStr(day)
              const isToday = dateStr === today
              return (
                <div
                  key={i}
                  className="border-border flex flex-col items-center gap-1 border-r py-2 last:border-r-0"
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

          {hasAllDayRow && (
            <div className="border-border grid border-t" style={{ gridTemplateColumns: GRID_TRACKS }}>
              <div className="border-border border-r" aria-hidden />
              {days.map((day, i) => {
                const dateStr = toDateStr(day)
                const allDay = allDayEventsForDate(dateStr)
                const dayTasks = tasksForDate(dateStr)
                const hasDailyNote = dailyNoteDates?.has(dateStr) ?? false

                return (
                  <div
                    key={i}
                    className="border-border flex min-h-[2rem] flex-col items-center gap-0.5 border-r p-1 last:border-r-0"
                  >
                    {hasDailyNote && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onDailyNoteClick?.(dateStr)
                        }}
                        title="Open daily note"
                        className="size-2 shrink-0 rounded-full bg-amber-400 hover:opacity-70 dark:bg-amber-500"
                      />
                    )}
                    <div className="flex w-full flex-col gap-0.5">
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
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="grid" style={{ gridTemplateColumns: GRID_TRACKS, height: TOTAL_HEIGHT }}>
          <div
            className="border-border pointer-events-none relative shrink-0 border-r"
            style={{ height: TOTAL_HEIGHT }}
          >
            {HOURS.map((h) => (
              <div key={h} className="border-border relative border-t" style={{ height: HOUR_HEIGHT }}>
                {h > 0 && (
                  <span className="text-fg-muted absolute right-2 bottom-full pb-0.5 text-[10px] tabular-nums">
                    {hourLabel(h)}
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="relative col-start-2 col-span-7 min-h-0 min-w-0" style={{ height: TOTAL_HEIGHT }}>
            <div className="grid h-full grid-cols-7" style={{ height: TOTAL_HEIGHT }}>
              {days.map((day, i) => {
                const dateStr = toDateStr(day)
                const isToday = dateStr === today
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
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onDayClick(dateStr)
                    }}
                    className={cn(
                      'border-border relative min-w-0 cursor-pointer border-r last:border-r-0',
                      isToday ? 'bg-accent/[0.03]' : 'bg-bg',
                    )}
                    style={{ height: TOTAL_HEIGHT }}
                  >
                    {HOURS.map((h) => (
                      <div
                        key={h}
                        className="border-border absolute inset-x-0 border-t"
                        style={{ top: h * HOUR_HEIGHT }}
                      />
                    ))}
                    {HOURS.map((h) => (
                      <div
                        key={`h${h}`}
                        className="border-border/40 absolute inset-x-0 border-t"
                        style={{ top: h * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                      />
                    ))}
                    {timedEvs.map((ev) => (
                      <TimedEventBlock
                        key={ev.path}
                        event={ev}
                        onClick={(evt) => {
                          onEventClick(evt)
                        }}
                      />
                    ))}
                  </div>
                )
              })}
            </div>

            {isThisWeek && (
              <div
                className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
                style={{ top: nowTop }}
              >
                <div className="size-2 shrink-0 rounded-full bg-rose-500" />
                <div className="h-px flex-1 bg-rose-500/70" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
