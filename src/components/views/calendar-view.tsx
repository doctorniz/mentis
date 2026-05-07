'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, Plus } from 'lucide-react'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { useCalendarStore } from '@/stores/calendar'
import { useTasksStore } from '@/stores/tasks'
import { useVaultStore } from '@/stores/vault'
import { useEditorStore } from '@/stores/editor'
import { useFileTreeStore } from '@/stores/file-tree'
import { useUiStore } from '@/stores/ui'
import { CalendarGrid } from '@/components/calendar/calendar-grid'
import { WeekGrid } from '@/components/calendar/week-grid'
import { DayGrid } from '@/components/calendar/day-grid'
import { EventDialog } from '@/components/calendar/event-dialog'
import type { CalendarEvent } from '@/types/calendar'
import { toDateStr } from '@/lib/calendar'
import { listDailyNoteDates, openOrCreateDailyNote } from '@/lib/notes/daily-note'
import { DAILY_NOTES_DIR, ViewMode } from '@/types/vault'
import { cn } from '@/utils/cn'

// ─── Types ───────────────────────────────────────────────────────────────────

type CalendarViewMode = 'day' | 'week' | 'month'
const LS_KEY = 'ink-calendar-view'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function addMonths(date: Date, n: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + n)
  return d
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

function isSameWeek(a: Date, b: Date): boolean {
  const startA = new Date(a); startA.setDate(a.getDate() - a.getDay())
  const startB = new Date(b); startB.setDate(b.getDate() - b.getDay())
  return toDateStr(startA) === toDateStr(startB)
}

function formatHeading(viewMode: CalendarViewMode, refDate: Date): string {
  if (viewMode === 'month') {
    return `${MONTH_NAMES[refDate.getMonth()]} ${refDate.getFullYear()}`
  }
  if (viewMode === 'day') {
    return refDate.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    })
  }
  // week: match month headline — spans are obvious from column headers below
  return `${MONTH_NAMES[refDate.getMonth()]} ${refDate.getFullYear()}`
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CalendarView() {
  const { vaultFs } = useVaultSession()
  const loadEvents = useCalendarStore((s) => s.loadEvents)
  const events = useCalendarStore((s) => s.events)
  const loading = useCalendarStore((s) => s.loading)
  const config = useVaultStore((s) => s.config)
  const setActiveView = useUiStore((s) => s.setActiveView)

  const loadTasks = useTasksStore((s) => s.loadTasks)
  const tasks = useTasksStore((s) => s.items)

  const dailyFolder = config?.dailyNotesFolder ?? DAILY_NOTES_DIR
  const [dailyNoteDates, setDailyNoteDates] = useState<Set<string>>(new Set())

  // Persisted view mode (default: week)
  const [viewMode, setViewModeState] = useState<CalendarViewMode>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null
    return (saved as CalendarViewMode | null) ?? 'week'
  })

  const setViewMode = (m: CalendarViewMode) => {
    setViewModeState(m)
    try { localStorage.setItem(LS_KEY, m) } catch { /* noop */ }
  }

  // Reference date — the "current" date in view
  const [refDate, setRefDate] = useState(new Date())

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null)
  const [clickedDate, setClickedDate] = useState<string | undefined>()

  useEffect(() => {
    void loadEvents(vaultFs)
    void loadTasks(vaultFs)
  }, [vaultFs, loadEvents, loadTasks])

  useEffect(() => {
    void listDailyNoteDates(vaultFs, dailyFolder).then(setDailyNoteDates)
  }, [vaultFs, dailyFolder])

  // ── Navigation ──────────────────────────────────────────────────────────────

  const goPrev = useCallback(() => {
    setRefDate((d) =>
      viewMode === 'day'   ? addDays(d, -1)
      : viewMode === 'week'  ? addDays(d, -7)
      : addMonths(d, -1),
    )
  }, [viewMode])

  const goNext = useCallback(() => {
    setRefDate((d) =>
      viewMode === 'day'   ? addDays(d, 1)
      : viewMode === 'week'  ? addDays(d, 7)
      : addMonths(d, 1),
    )
  }, [viewMode])

  const goToday = useCallback(() => setRefDate(new Date()), [])

  // ── Event handlers ──────────────────────────────────────────────────────────

  const handleDayClick = useCallback((dateStr: string) => {
    setEditEvent(null)
    setClickedDate(dateStr)
    setDialogOpen(true)
  }, [])

  // Time-slot click from week view — passes a full YYYY-MM-DDTHH:mm string
  const handleTimeSlotClick = useCallback((dateTimeStr: string) => {
    setEditEvent(null)
    setClickedDate(dateTimeStr)
    setDialogOpen(true)
  }, [])

  const handleDailyNoteClick = useCallback(async (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number]
    const date = new Date(y, m - 1, d)
    const path = await openOrCreateDailyNote(vaultFs, date, dailyFolder)
    const { detectEditorTabType, titleFromVaultPath } = await import('@/lib/notes/editor-tab-from-path')
    const type = await detectEditorTabType(vaultFs, path)
    useFileTreeStore.getState().setSelectedPath(path)
    useEditorStore.getState().addRecentFile(path)
    useEditorStore.getState().openTab({
      id: crypto.randomUUID(),
      path,
      type,
      title: titleFromVaultPath(path),
      isDirty: false,
    })
    setActiveView(ViewMode.Vault)
    void listDailyNoteDates(vaultFs, dailyFolder).then(setDailyNoteDates)
  }, [vaultFs, dailyFolder, setActiveView])

  const handleEventClick = useCallback((ev: CalendarEvent) => {
    setEditEvent(ev)
    setClickedDate(undefined)
    setDialogOpen(true)
  }, [])

  // ── "Today" button visibility ───────────────────────────────────────────────

  const now = new Date()
  const isAtToday =
    viewMode === 'day'   ? toDateStr(refDate) === toDateStr(now)
    : viewMode === 'week'  ? isSameWeek(refDate, now)
    : isSameMonth(refDate, now)

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="border-border bg-bg-secondary flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <h1 className="text-fg min-w-[12rem] text-sm font-semibold tabular-nums">
            {formatHeading(viewMode, refDate)}
          </h1>
          <button
            type="button"
            onClick={goPrev}
            className="text-fg-secondary hover:bg-bg-hover hover:text-fg rounded-md p-1 transition-colors"
            aria-label="Previous"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={goNext}
            className="text-fg-secondary hover:bg-bg-hover hover:text-fg rounded-md p-1 transition-colors"
            aria-label="Next"
          >
            <ChevronRight className="size-4" />
          </button>
          {!isAtToday && (
            <button
              type="button"
              onClick={goToday}
              className="border-border text-fg-secondary hover:bg-bg-hover hover:text-fg rounded-md border px-2.5 py-1 text-xs transition-colors"
            >
              Today
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* View switcher */}
          <div className="border-border bg-bg flex rounded-lg border p-0.5">
            {(['day', 'week', 'month'] as CalendarViewMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setViewMode(m)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors',
                  viewMode === m
                    ? 'bg-accent text-accent-fg'
                    : 'text-fg-secondary hover:text-fg',
                )}
              >
                {m}
              </button>
            ))}
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
      </div>

      {/* Legend row — only for month/week views */}
      {viewMode !== 'day' && (
        <div className="border-border flex shrink-0 items-center gap-4 border-b px-4 py-1.5">
          <div className="flex items-center gap-1.5">
            <span className="bg-accent size-2 rounded-full" />
            <span className="text-fg-muted text-[10px]">Events</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="bg-bg-tertiary border-border size-2 rounded-full border" />
            <span className="text-fg-muted text-[10px]">Task due</span>
          </div>
          {dailyNoteDates.size > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-amber-400 dark:bg-amber-500" />
              <span className="text-fg-muted text-[10px]">Daily note</span>
            </div>
          )}
        </div>
      )}

      {/* Calendar body */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="text-fg-muted size-6 animate-spin" />
        </div>
      ) : viewMode === 'month' ? (
        <CalendarGrid
          year={refDate.getFullYear()}
          month={refDate.getMonth()}
          events={events}
          tasks={tasks}
          dailyNoteDates={dailyNoteDates}
          onDayClick={handleDayClick}
          onEventClick={handleEventClick}
          onDailyNoteClick={(d) => void handleDailyNoteClick(d)}
        />
      ) : viewMode === 'week' ? (
        <WeekGrid
          referenceDate={refDate}
          events={events}
          tasks={tasks}
          dailyNoteDates={dailyNoteDates}
          onDayClick={handleDayClick}
          onTimeSlotClick={handleTimeSlotClick}
          onEventClick={handleEventClick}
          onDailyNoteClick={(d) => void handleDailyNoteClick(d)}
        />
      ) : (
        <DayGrid
          date={refDate}
          events={events}
          tasks={tasks}
          dailyNoteDates={dailyNoteDates}
          onAddEvent={handleDayClick}
          onEventClick={handleEventClick}
          onDailyNoteClick={(d) => void handleDailyNoteClick(d)}
        />
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
