'use client'

import { CalendarDays } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { CalendarEvent } from '@/types/calendar'
import type { TaskItem } from '@/types/tasks'
import { eventOccursOn, toDateStr } from '@/lib/calendar'
import { getEffectiveDueDate } from '@/lib/tasks/recurrence'

function fmtTime(dateStr: string): string {
  if (!dateStr.includes('T')) return 'All day'
  const [, time] = dateStr.split('T')
  if (!time) return 'All day'
  const [h, m] = time.split(':').map(Number) as [number, number]
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

interface DayGridProps {
  date: Date
  events: CalendarEvent[]
  tasks: TaskItem[]
  dailyNoteDates?: Set<string>
  onAddEvent: (dateStr: string) => void
  onEventClick: (event: CalendarEvent) => void
  onDailyNoteClick?: (dateStr: string) => void
}

export function DayGrid({
  date,
  events,
  tasks,
  dailyNoteDates,
  onAddEvent,
  onEventClick,
  onDailyNoteClick,
}: DayGridProps) {
  const dateStr = toDateStr(date)
  const today = toDateStr(new Date())
  const isToday = dateStr === today

  const dayEvents = events
    .filter((ev) => eventOccursOn(ev, dateStr))
    .slice()
    .sort((a, b) => {
      const ta = a.allDay ? '' : a.start
      const tb = b.allDay ? '' : b.start
      return ta.localeCompare(tb)
    })

  const dayTasks = tasks.filter((t) => {
    if (t.status === 'done' || t.status === 'cancelled') return false
    const eff = getEffectiveDueDate(t)
    return eff ? eff.slice(0, 10) === dateStr : false
  })

  const hasDailyNote = dailyNoteDates?.has(dateStr) ?? false

  const allDayEvents = dayEvents.filter((ev) => ev.allDay)
  const timedEvents  = dayEvents.filter((ev) => !ev.allDay)

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {/* Date header */}
      <div
        className={cn(
          'border-border flex items-center gap-3 border-b px-5 py-4',
          isToday && 'bg-accent/5',
        )}
      >
        <div
          className={cn(
            'flex size-10 items-center justify-center rounded-full text-lg font-bold',
            isToday ? 'bg-accent text-accent-fg' : 'bg-bg-secondary text-fg',
          )}
        >
          {date.getDate()}
        </div>
        <div>
          <p className="text-fg text-base font-semibold">
            {date.toLocaleDateString('en-US', { weekday: 'long' })}
          </p>
          <p className="text-fg-muted text-xs">
            {date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </p>
        </div>
        {hasDailyNote && (
          <button
            type="button"
            onClick={() => onDailyNoteClick?.(dateStr)}
            title="Open daily note"
            className="ml-auto flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20"
          >
            <span className="size-2 rounded-full bg-amber-400 dark:bg-amber-500" />
            Daily note
          </button>
        )}
      </div>

      <div className="flex flex-col gap-4 px-5 py-4">
        {/* All-day events */}
        {allDayEvents.length > 0 && (
          <section>
            <p className="text-fg-muted mb-2 text-xs font-medium uppercase tracking-wide">All day</p>
            <div className="flex flex-col gap-1.5">
              {allDayEvents.map((ev) => (
                <EventCard key={ev.path} event={ev} onClick={onEventClick} />
              ))}
            </div>
          </section>
        )}

        {/* Timed events */}
        {timedEvents.length > 0 && (
          <section>
            <p className="text-fg-muted mb-2 text-xs font-medium uppercase tracking-wide">Events</p>
            <div className="flex flex-col gap-1.5">
              {timedEvents.map((ev) => (
                <EventCard key={ev.path} event={ev} onClick={onEventClick} showTime />
              ))}
            </div>
          </section>
        )}

        {/* Tasks due */}
        {dayTasks.length > 0 && (
          <section>
            <p className="text-fg-muted mb-2 text-xs font-medium uppercase tracking-wide">Due today</p>
            <div className="flex flex-col gap-1.5">
              {dayTasks.map((t) => (
                <div
                  key={t.path}
                  className="border-border bg-bg-secondary flex items-center gap-3 rounded-lg border px-3 py-2.5"
                >
                  <div className="border-border size-4 shrink-0 rounded-full border-2" />
                  <span className="text-fg-secondary min-w-0 flex-1 truncate text-sm">{t.title || 'Untitled'}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {dayEvents.length === 0 && dayTasks.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16">
            <CalendarDays className="text-fg-muted/30 size-10" />
            <p className="text-fg-muted text-sm">Nothing scheduled.</p>
            <button
              type="button"
              onClick={() => onAddEvent(dateStr)}
              className="text-accent hover:underline text-sm"
            >
              Add event
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function EventCard({
  event,
  onClick,
  showTime,
}: {
  event: CalendarEvent
  onClick: (ev: CalendarEvent) => void
  showTime?: boolean
}) {
  const colorMap: Record<string, string> = {
    violet: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
    sky:    'bg-sky-500/15 text-sky-700 dark:text-sky-300',
    emerald:'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    amber:  'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    rose:   'bg-rose-500/15 text-rose-700 dark:text-rose-300',
    slate:  'bg-slate-500/15 text-slate-600 dark:text-slate-300',
  }
  const colorCls = colorMap[event.color ?? 'violet'] ?? colorMap['violet']!

  return (
    <button
      type="button"
      onClick={() => onClick(event)}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-opacity hover:opacity-80',
        colorCls,
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{event.title || 'Untitled'}</p>
        {showTime && !event.allDay && (
          <p className="mt-0.5 text-xs opacity-70">
            {fmtTime(event.start)}
            {event.end && event.end !== event.start ? ` – ${fmtTime(event.end)}` : ''}
          </p>
        )}
        {event.location && (
          <p className="mt-0.5 truncate text-xs opacity-60">📍 {event.location}</p>
        )}
        {event.url && (
          <a
            href={event.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-0.5 block truncate text-xs opacity-60 underline hover:opacity-100"
          >
            {event.url.replace(/^https?:\/\//, '')}
          </a>
        )}
      </div>
    </button>
  )
}
