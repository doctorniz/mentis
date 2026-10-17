import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell, BookOpen, CalendarDays, CheckSquare } from 'lucide-react'
import type { ReminderRow } from '@/core/index/protocol'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { getReminderRows, whenSearchIndexOpen } from '@/lib/search'
import { groupReminders, reminderTabRange, UPCOMING_DAYS } from '@/lib/reminders/group'
import { describeReminder, reminderId } from '@/lib/reminders/sources'
import { settleReminders, type Settle } from '@/lib/reminders/actions'
import { REMINDERS_CHANGED } from '@/lib/reminders/events'
import { toast } from '@/stores/toast'
import { ReminderActions } from './reminder-actions'

/**
 * The reminders the index holds for the Reminders tab: the last week through
 * the next. Read again whenever the scheduler records new ones, and once a
 * minute so what is due moves from Upcoming to Missed.
 */
export function useReminderRows(): { rows: ReminderRow[]; now: Date; loaded: boolean } {
  const [rows, setRows] = useState<ReminderRow[]>([])
  const [now, setNow] = useState(() => new Date())
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    await whenSearchIndexOpen()
    const at = new Date()
    const { from, to } = reminderTabRange(at)
    const next = await getReminderRows(from, to).catch(() => [])
    setRows(next)
    setNow(at)
    setLoaded(true)
  }, [])

  useEffect(() => {
    void load()
    const onChanged = () => void load()
    window.addEventListener(REMINDERS_CHANGED, onChanged)
    const minute = setInterval(onChanged, 60_000)
    return () => {
      window.removeEventListener(REMINDERS_CHANGED, onChanged)
      clearInterval(minute)
    }
  }, [load])

  return { rows, now, loaded }
}

const KIND_ICON = { task: CheckSquare, event: CalendarDays, journal: BookOpen } as const

function ReminderList({
  title,
  rows,
  missed,
  onSettle,
}: {
  title: string
  rows: ReminderRow[]
  missed?: boolean
  onSettle: (rows: ReminderRow[], how: Settle) => void
}) {
  if (rows.length === 0) return null
  return (
    <section aria-label={title} className="py-2">
      <h2
        className={`px-4 py-1 text-xs font-semibold tracking-wide uppercase ${missed ? 'text-warning' : 'text-fg-muted'}`}
      >
        {title}
      </h2>
      <ul>
        {rows.map((r) => {
          const Icon = KIND_ICON[r.kind]
          return (
            <li
              key={reminderId(r)}
              className="border-border/40 flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2"
            >
              <Icon className="text-fg-muted size-4 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-fg truncate text-sm">{r.title || 'Untitled'}</p>
                <p className="text-fg-muted text-xs">{describeReminder(r)}</p>
              </div>
              <ReminderActions row={r} snooze={missed} onSettle={(how) => onSettle([r], how)} />
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** The Reminders tab: missed ones, then what is coming today, tomorrow and later this week. */
export function RemindersPanel({ rows, now, loaded }: ReturnType<typeof useReminderRows>) {
  const { vaultFs, vaultPath } = useVaultSession()
  // Hidden at once on Done or Snooze; the index catches up a moment later.
  const [settled, setSettled] = useState<Set<string>>(new Set())
  useEffect(() => setSettled(new Set()), [rows])

  const groups = useMemo(
    () =>
      groupReminders(
        rows.filter((r) => !settled.has(reminderId(r))),
        now,
      ),
    [rows, now, settled],
  )

  const settle = useCallback(
    (list: ReminderRow[], how: Settle) => {
      setSettled((s) => new Set([...s, ...list.map(reminderId)]))
      settleReminders(vaultFs, vaultPath, list, how).catch(() =>
        toast.error('Could not save the reminder.'),
      )
    },
    [vaultFs, vaultPath],
  )

  const empty =
    groups.missed.length + groups.today.length + groups.tomorrow.length + groups.later.length === 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border bg-bg-secondary flex shrink-0 items-center border-b px-4 py-2.5">
        <h1 className="text-fg text-sm font-semibold">Reminders</h1>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loaded && empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <Bell className="text-fg-muted/30 size-10" />
            <p className="text-fg-muted text-sm">No reminders in the next {UPCOMING_DAYS} days.</p>
          </div>
        ) : (
          <>
            <ReminderList title="Missed" rows={groups.missed} missed onSettle={settle} />
            <ReminderList title="Today" rows={groups.today} onSettle={settle} />
            <ReminderList title="Tomorrow" rows={groups.tomorrow} onSettle={settle} />
            <ReminderList title="Later" rows={groups.later} onSettle={settle} />
          </>
        )}
      </div>
    </div>
  )
}
