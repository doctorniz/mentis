'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bell, BellRing, ChevronDown, X } from 'lucide-react'
import type { ReminderRow } from '@/core/index/protocol'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { isTauri } from '@/lib/fs/platform'
import { acknowledged, snoozed } from '@/lib/reminders'
import { startReminders } from '@/lib/reminders/scheduler'
import { describeReminder, reminderId, settleReminder } from '@/lib/reminders/sources'
import { requestOpen } from '@/lib/reminders/open'
import { useUiStore } from '@/stores/ui'
import { useTasksStore } from '@/stores/tasks'
import { useCalendarStore } from '@/stores/calendar'
import { toast } from '@/stores/toast'

/**
 * Runs the reminder scheduler for the open vault and shows what it delivers:
 * a card per reminder that falls due, with Open, Snooze and Done, and one
 * summary of those missed while the app was closed. Loaded after the shell is
 * up, so none of it weighs on startup.
 */

const SNOOZES: Array<{ label: string; until: (now: Date) => Date }> = [
  { label: '10 minutes', until: (now) => new Date(now.getTime() + 10 * 60_000) },
  { label: '1 hour', until: (now) => new Date(now.getTime() + 60 * 60_000) },
  {
    label: 'Tomorrow 9:00',
    until: (now) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0),
  },
]

const button =
  'border-border text-fg hover:bg-bg-hover rounded-md border px-2 py-1 text-xs font-medium'

export default function ReminderHost() {
  const { vaultFs, vaultPath } = useVaultSession()
  const [due, setDue] = useState<ReminderRow[]>([])
  const [missed, setMissed] = useState<ReminderRow[]>([])
  const [missedOpen, setMissedOpen] = useState(false)
  const [snoozeFor, setSnoozeFor] = useState<string | null>(null)
  const [canAsk, setCanAsk] = useState(
    () =>
      !isTauri() && typeof Notification !== 'undefined' && Notification.permission === 'default',
  )

  useEffect(() => {
    setDue([])
    setMissed([])
    return startReminders(vaultFs, vaultPath, {
      onDue: (rows) =>
        setDue((d) => [
          ...d.filter((x) => !rows.some((r) => reminderId(r) === reminderId(x))),
          ...rows,
        ]),
      onMissed: (rows) => setMissed(rows),
    })
  }, [vaultFs, vaultPath])

  /** Write Done or Snooze into each item's file, then refresh what shows them. */
  const settle = useCallback(
    async (rows: ReminderRow[], fields: { reminderAck: string; snoozeUntil: string }) => {
      const paths = [...new Set(rows.map((r) => r.path))]
      try {
        for (const path of paths) await settleReminder(vaultFs, path, fields)
      } catch {
        toast.error('Could not save the reminder.')
        return
      }
      const tasks = useTasksStore.getState()
      if (tasks.items.some((t) => paths.includes(t.path))) await tasks.loadTasks(vaultFs)
      const calendar = useCalendarStore.getState()
      if (calendar.events.some((e) => paths.includes(e.path))) await calendar.loadEvents(vaultFs)
      window.dispatchEvent(new CustomEvent('ink:vault-changed'))
    },
    [vaultFs],
  )

  const drop = (rows: ReminderRow[]) => {
    const ids = new Set(rows.map(reminderId))
    setDue((d) => d.filter((r) => !ids.has(reminderId(r))))
  }

  const open = (row: ReminderRow) => {
    useUiStore.getState().setActiveView('organizer')
    requestOpen(row.kind, row.path)
  }

  if (due.length === 0 && missed.length === 0) return null

  return createPortal(
    <div
      aria-live="polite"
      aria-label="Reminders"
      className="fixed top-4 right-4 left-4 z-[9998] flex flex-col items-end gap-2 sm:left-auto"
    >
      {missed.length > 0 && (
        <section
          role="alert"
          className="bg-bg-secondary border-border w-full rounded-lg border p-3 shadow-lg sm:w-[340px]"
        >
          <div className="flex items-start gap-2">
            <Bell className="text-warning mt-0.5 size-4 shrink-0" aria-hidden />
            <button
              type="button"
              onClick={() => setMissedOpen((o) => !o)}
              className="text-fg flex flex-1 items-center gap-1 text-left text-sm font-medium"
              aria-expanded={missedOpen}
            >
              You missed {missed.length} reminder{missed.length === 1 ? '' : 's'}
              <ChevronDown
                className={`size-4 transition-transform ${missedOpen ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>
            <button
              type="button"
              onClick={() => setMissed([])}
              className="text-fg-muted hover:text-fg shrink-0"
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </button>
          </div>
          {missedOpen && (
            <ul className="mt-2 flex max-h-60 flex-col gap-1 overflow-y-auto">
              {missed.map((r) => (
                <li key={reminderId(r)}>
                  <button
                    type="button"
                    onClick={() => open(r)}
                    className="hover:bg-bg-hover flex w-full flex-col rounded px-2 py-1 text-left"
                  >
                    <span className="text-fg truncate text-sm">{r.title || 'Untitled'}</span>
                    <span className="text-fg-muted text-xs">{describeReminder(r)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              className={button}
              onClick={() => {
                const rows = missed
                setMissed([])
                void settle(rows, acknowledged(new Date()))
              }}
            >
              Done all
            </button>
          </div>
        </section>
      )}

      {due.map((r) => {
        const id = reminderId(r)
        return (
          <section
            key={id}
            role="alert"
            className="bg-bg-secondary border-accent/40 w-full rounded-lg border p-3 shadow-lg sm:w-[340px]"
          >
            <div className="flex items-start gap-2">
              <BellRing className="text-accent mt-0.5 size-4 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-fg truncate text-sm font-medium">{r.title || 'Untitled'}</p>
                <p className="text-fg-muted text-xs">{describeReminder(r)}</p>
              </div>
              <button
                type="button"
                onClick={() => drop([r])}
                className="text-fg-muted hover:text-fg shrink-0"
                aria-label="Dismiss"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap justify-end gap-2">
              <button type="button" className={button} onClick={() => open(r)}>
                Open
              </button>
              <div className="relative">
                <button
                  type="button"
                  className={`${button} flex items-center gap-1`}
                  aria-haspopup="menu"
                  aria-expanded={snoozeFor === id}
                  onClick={() => setSnoozeFor((s) => (s === id ? null : id))}
                >
                  Snooze <ChevronDown className="size-3" aria-hidden />
                </button>
                {snoozeFor === id && (
                  <div
                    role="menu"
                    className="bg-bg border-border absolute right-0 z-10 mt-1 flex w-36 flex-col rounded-md border py-1 shadow-lg"
                  >
                    {SNOOZES.map((s) => (
                      <button
                        key={s.label}
                        type="button"
                        role="menuitem"
                        className="text-fg hover:bg-bg-hover px-3 py-1.5 text-left text-xs"
                        onClick={() => {
                          setSnoozeFor(null)
                          drop([r])
                          const now = new Date()
                          void settle([r], snoozed(now, s.until(now)))
                        }}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="bg-accent text-accent-fg hover:bg-accent/90 rounded-md px-2 py-1 text-xs font-medium"
                onClick={() => {
                  drop([r])
                  void settle([r], acknowledged(new Date()))
                }}
              >
                Done
              </button>
            </div>
            {canAsk && (
              <button
                type="button"
                className="text-accent mt-2 text-xs hover:underline"
                onClick={() => {
                  void Notification.requestPermission().then(() => setCanAsk(false))
                }}
              >
                Notify me even when this tab is in the background
              </button>
            )}
          </section>
        )
      })}
    </div>,
    document.body,
  )
}
