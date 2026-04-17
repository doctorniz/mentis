'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays, Loader2, Plus } from 'lucide-react'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { useCalendarStore } from '@/stores/calendar'
import { useTasksStore } from '@/stores/tasks'
import { CalendarGrid } from '@/components/calendar/calendar-grid'
import { EventDialog } from '@/components/calendar/event-dialog'
import type { CalendarEvent } from '@/types/calendar'
import { toDateStr } from '@/lib/calendar'
import { cn } from '@/utils/cn'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function CalendarView() {
  const { vaultFs } = useVaultSession()
  const loadEvents = useCalendarStore((s) => s.loadEvents)
  const events = useCalendarStore((s) => s.events)
  const loading = useCalendarStore((s) => s.loading)

  const loadTasks = useTasksStore((s) => s.loadTasks)
  const tasks = useTasksStore((s) => s.items)

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null)
  const [clickedDate, setClickedDate] = useState<string | undefined>()

  useEffect(() => {
    void loadEvents(vaultFs)
    void loadTasks(vaultFs)
  }, [vaultFs, loadEvents, loadTasks])

  const prevMonth = useCallback(() => {
    setMonth((m) => {
      if (m === 0) { setYear((y) => y - 1); return 11 }
      return m - 1
    })
  }, [])

  const nextMonth = useCallback(() => {
    setMonth((m) => {
      if (m === 11) { setYear((y) => y + 1); return 0 }
      return m + 1
    })
  }, [])

  const goToday = useCallback(() => {
    const d = new Date()
    setYear(d.getFullYear())
    setMonth(d.getMonth())
  }, [])

  const handleDayClick = useCallback((dateStr: string) => {
    setEditEvent(null)
    setClickedDate(dateStr)
    setDialogOpen(true)
  }, [])

  const handleEventClick = useCallback((ev: CalendarEvent) => {
    setEditEvent(ev)
    setClickedDate(undefined)
    setDialogOpen(true)
  }, [])

  const isCurrentMonth =
    year === now.getFullYear() && month === now.getMonth()

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="border-border bg-bg-secondary flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          {/* Month / Year heading */}
          <h1 className="text-fg min-w-[11rem] text-sm font-semibold tabular-nums">
            {MONTH_NAMES[month]} {year}
          </h1>

          <button
            type="button"
            onClick={prevMonth}
            className="text-fg-secondary hover:bg-bg-hover hover:text-fg rounded-md p-1 transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={nextMonth}
            className="text-fg-secondary hover:bg-bg-hover hover:text-fg rounded-md p-1 transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </button>
          {!isCurrentMonth && (
            <button
              type="button"
              onClick={goToday}
              className="border-border text-fg-secondary hover:bg-bg-hover hover:text-fg rounded-md border px-2.5 py-1 text-xs transition-colors"
            >
              Today
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            setEditEvent(null)
            setClickedDate(toDateStr(new Date()))
            setDialogOpen(true)
          }}
          className="bg-accent text-accent-fg hover:bg-accent-hover flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
        >
          <Plus className="size-3.5" />
          New event
        </button>
      </div>

      {/* Legend row */}
      <div className="border-border flex shrink-0 items-center gap-4 border-b px-4 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className="bg-accent size-2 rounded-full" />
          <span className="text-fg-muted text-[10px]">Events</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="bg-bg-tertiary border-border size-2 rounded-full border" />
          <span className="text-fg-muted text-[10px]">Task due</span>
        </div>
      </div>

      {/* Calendar body */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="text-fg-muted size-6 animate-spin" />
        </div>
      ) : (
        <CalendarGrid
          year={year}
          month={month}
          events={events}
          tasks={tasks}
          onDayClick={handleDayClick}
          onEventClick={handleEventClick}
        />
      )}

      {/* Empty state hint */}
      {!loading && events.length === 0 && tasks.filter((t) => t.due).length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
          <CalendarDays className="text-fg-muted/20 size-12" />
          <p className="text-fg-muted text-sm">Click any day to add an event</p>
        </div>
      )}

      <EventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        event={editEvent}
        defaultDate={clickedDate}
      />
    </div>
  )
}
