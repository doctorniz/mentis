import { useEffect, useMemo } from 'react'
import { CalendarView } from '@/components/views/calendar-view'
import { RemindersPanel, useReminderRows } from '@/components/reminders/reminders-panel'
import { groupReminders } from '@/lib/reminders/group'
import { ViewTabs, useRememberedTab } from '@/components/views/view-tabs'
import { OPEN_REMINDER_EVENT, pendingOpenKind } from '@/lib/reminders/open'

type Tab = 'calendar' | 'reminders'

export function CalendarPage() {
  const [tab, setTab] = useRememberedTab<Tab>(
    'ink-calendar-tab',
    ['calendar', 'reminders'],
    'calendar',
  )

  const reminders = useReminderRows()
  const missedCount = useMemo(
    () => groupReminders(reminders.rows, reminders.now).missed.length,
    [reminders.rows, reminders.now],
  )

  // An event reminder's Open: show the calendar, which then opens the event.
  useEffect(() => {
    function openRequested() {
      if (pendingOpenKind() === 'event') setTab('calendar')
    }
    openRequested()
    window.addEventListener(OPEN_REMINDER_EVENT, openRequested)
    return () => window.removeEventListener(OPEN_REMINDER_EVENT, openRequested)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tabs = [
    { id: 'calendar', label: 'Calendar' },
    {
      id: 'reminders',
      label: 'Reminders',
      badge: { count: missedCount, label: `${missedCount} missed` },
    },
  ] as const

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewTabs tabs={tabs} active={tab} onChange={setTab} />
      <div className="min-h-0 flex-1">
        {tab === 'calendar' && <CalendarView />}
        {tab === 'reminders' && <RemindersPanel {...reminders} />}
      </div>
    </div>
  )
}
