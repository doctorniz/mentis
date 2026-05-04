'use client'

import { useMemo, useCallback } from 'react'
import { cn } from '@/utils/cn'
import type { CalendarEvent } from '@/types/calendar'
import type { TaskItem } from '@/types/tasks'
import { EVENT_COLOR_DOT } from '@/types/calendar'
import { eventOccursOn, eventStartDate, toDateStr } from '@/lib/calendar'
import { getEffectiveDueDate } from '@/lib/tasks/recurrence'

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function buildMonthGrid(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const startPad = first.getDay()

  const days: Date[] = []
  for (let i = 0; i < startPad; i++) {
    days.push(new Date(year, month, 1 - (startPad - i)))
  }
  for (let d = 1; d <= last.getDate(); d++) {
    days.push(new Date(year, month, d))
  }
  while (days.length % 7 !== 0) {
    const last = days[days.length - 1]!
    days.push(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1))
  }

  const weeks: Date[][] = []
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7))
  }
  return weeks
}

interface CalendarGridProps {
  year: number
  month: number
  events: CalendarEvent[]
  tasks: TaskItem[]
  /** Set of YYYY-MM-DD strings that have a daily note on disk. */
  dailyNoteDates?: Set<string>
  onDayClick: (dateStr: string) => void
  onEventClick: (event: CalendarEvent) => void
  /** Called when the user clicks the daily-note dot on a date. */
  onDailyNoteClick?: (dateStr: string) => void
}

export function CalendarGrid({
  year,
  month,
  events,
  tasks,
  dailyNoteDates,
  onDayClick,
  onEventClick,
  onDailyNoteClick,
}: CalendarGridProps) {
  const today = toDateStr(new Date())
  const weeks = useMemo(() => buildMonthGrid(year, month), [year, month])

  const eventsForDate = useCallback(
    (dateStr: string) => events.filter((ev) => eventOccursOn(ev, dateStr)),
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Day headers */}
      <div className="border-border grid grid-cols-7 border-b">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="text-fg-muted py-2 text-center text-xs font-medium">
            {d}
          </div>
        ))}
      </div>

      {/* Weeks */}
      <div className="flex min-h-0 flex-1 flex-col">
        {weeks.map((week, wi) => (
          <div
            key={wi}
            className="border-border grid min-h-0 flex-1 grid-cols-7 border-b last:border-b-0"
          >
            {week.map((day) => {
              const isCurrentMonth = day.getMonth() === month
              const dateStr = toDateStr(day)
              const isToday = dateStr === today
              const dayEvents = eventsForDate(dateStr)
              const dayTasks = tasksForDate(dateStr)
              const hasItems = dayEvents.length > 0 || dayTasks.length > 0
              const hasDailyNote = dailyNoteDates?.has(dateStr) ?? false

              return (
                <div
                  key={dateStr}
                  onClick={() => onDayClick(dateStr)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onDayClick(dateStr)
                  }}
                  className={cn(
                    'border-border flex min-h-0 cursor-pointer flex-col gap-0.5 overflow-hidden border-r p-1.5 transition-colors last:border-r-0',
                    isCurrentMonth ? 'bg-bg hover:bg-bg-hover' : 'bg-bg-secondary/40 hover:bg-bg-secondary/70',
                  )}
                >
                  {/* Date number row — with optional daily note dot */}
                  <div className="mb-0.5 flex items-center gap-1 self-start">
                    <div
                      className={cn(
                        'flex size-6 items-center justify-center rounded-full text-xs font-medium leading-none',
                        isToday
                          ? 'bg-accent text-accent-fg'
                          : isCurrentMonth
                            ? 'text-fg'
                            : 'text-fg-muted',
                      )}
                    >
                      {day.getDate()}
                    </div>
                    {hasDailyNote && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onDailyNoteClick?.(dateStr)
                        }}
                        title="Open daily note"
                        className="size-2 rounded-full bg-amber-400 transition-opacity hover:opacity-70 dark:bg-amber-500"
                        aria-label={`Daily note for ${dateStr}`}
                      />
                    )}
                  </div>

                  {/* Event chips */}
                  {hasItems && (
                    <div className="flex flex-col gap-0.5 overflow-hidden">
                      {dayEvents.slice(0, 3).map((ev) => (
                        <button
                          key={ev.path}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onEventClick(ev)
                          }}
                          className={cn(
                            'w-full truncate rounded px-1.5 py-0.5 text-left text-[10px] font-medium leading-snug transition-opacity hover:opacity-80',
                            'bg-violet-500/20 text-violet-700 dark:text-violet-300',
                          )}
                          style={{
                            backgroundColor:
                              ev.color === 'violet' ? undefined
                              : ev.color === 'sky' ? 'rgb(14 165 233 / 0.2)'
                              : ev.color === 'emerald' ? 'rgb(16 185 129 / 0.2)'
                              : ev.color === 'amber' ? 'rgb(245 158 11 / 0.2)'
                              : ev.color === 'rose' ? 'rgb(244 63 94 / 0.2)'
                              : 'rgb(100 116 139 / 0.2)',
                            color: undefined,
                          }}
                        >
                          <EventChip event={ev} />
                        </button>
                      ))}

                      {/* Task due chips */}
                      {dayTasks.slice(0, Math.max(0, 3 - dayEvents.length)).map((t) => (
                        <div
                          key={t.path}
                          className="bg-bg-tertiary text-fg-muted w-full truncate rounded px-1.5 py-0.5 text-[10px] font-medium leading-snug"
                        >
                          ✓ {t.title || 'Untitled'}
                        </div>
                      ))}

                      {/* Overflow indicator */}
                      {dayEvents.length + dayTasks.length > 3 && (
                        <div className="text-fg-muted px-1 text-[10px] leading-snug">
                          +{dayEvents.length + dayTasks.length - 3} more
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function EventChip({ event }: { event: CalendarEvent }) {
  const dot = EVENT_COLOR_DOT[event.color]
  return (
    <span className="flex items-center gap-1 truncate">
      <span className={cn('size-1.5 shrink-0 rounded-full', dot)} />
      <span className="truncate">{event.title}</span>
    </span>
  )
}
