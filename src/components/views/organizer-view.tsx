'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bell, CalendarDays, CheckSquare, List } from 'lucide-react'
import { TasksView } from '@/components/views/tasks-view'
import { ListsPanel } from '@/components/lists/lists-panel'
import { CalendarView } from '@/components/views/calendar-view'
import { RemindersPanel, useReminderRows } from '@/components/reminders/reminders-panel'
import { groupReminders } from '@/lib/reminders/group'
import { cn } from '@/utils/cn'
import { OPEN_REMINDER_EVENT, pendingOpenKind } from '@/lib/reminders/open'

export type OrganizerTab = 'tasks' | 'lists' | 'calendars' | 'reminders'

const TABS: { id: OrganizerTab; label: string; icon: typeof CheckSquare }[] = [
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
  { id: 'lists', label: 'Lists', icon: List },
  { id: 'calendars', label: 'Calendar', icon: CalendarDays },
  { id: 'reminders', label: 'Reminders', icon: Bell },
]

const LS_KEY = 'ink-organizer-tab'

export function OrganizerView({ initialTab }: { initialTab?: OrganizerTab }) {
  const [activeTab, setActiveTab] = useState<OrganizerTab>(() => {
    if (initialTab) return initialTab
    const saved = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null
    return (saved as OrganizerTab | null) ?? 'tasks'
  })

  const switchTab = (tab: OrganizerTab) => {
    setActiveTab(tab)
    try {
      localStorage.setItem(LS_KEY, tab)
    } catch {
      /* noop */
    }
  }

  const reminders = useReminderRows()
  const missedCount = useMemo(
    () => groupReminders(reminders.rows, reminders.now).missed.length,
    [reminders.rows, reminders.now],
  )

  // A reminder's Open: show the tab that holds its item, which then opens it.
  useEffect(() => {
    function openRequested() {
      const kind = pendingOpenKind()
      if (kind) setActiveTab(kind === 'task' ? 'tasks' : 'calendars')
    }
    openRequested()
    window.addEventListener(OPEN_REMINDER_EVENT, openRequested)
    return () => window.removeEventListener(OPEN_REMINDER_EVENT, openRequested)
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Sub-tab bar */}
      <div className="border-border bg-bg-secondary flex shrink-0 items-center gap-0 border-b px-3">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => switchTab(id)}
            className={cn(
              'relative px-4 py-2.5 text-sm font-medium transition-colors pointer-coarse:py-3.5',
              activeTab === id
                ? 'text-fg after:bg-accent after:absolute after:inset-x-0 after:bottom-0 after:h-[2px]'
                : 'text-fg-secondary hover:text-fg',
            )}
          >
            {label}
            {id === 'reminders' && missedCount > 0 && (
              <span
                className="bg-accent/10 text-accent ml-1.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
                aria-label={`${missedCount} missed`}
              >
                {missedCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="min-h-0 flex-1">
        {activeTab === 'tasks' && <TasksView />}
        {activeTab === 'lists' && <ListsPanel />}
        {activeTab === 'calendars' && <CalendarView />}
        {activeTab === 'reminders' && <RemindersPanel {...reminders} />}
      </div>
    </div>
  )
}
