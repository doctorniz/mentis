import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bell, BellRing, ChevronDown, X } from 'lucide-react'
import type { ReminderRow } from '@/core/index/protocol'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { isTauri } from '@/lib/fs/platform'
import { startReminders } from '@/lib/reminders/scheduler'
import { describeReminder, reminderId } from '@/lib/reminders/sources'
import { openReminder, settleReminders, type Settle } from '@/lib/reminders/actions'
import { toast } from '@/stores/toast'
import { ReminderActions, reminderButton } from './reminder-actions'

/**
 * Runs the reminder scheduler for the open vault and shows what it delivers:
 * a card per reminder that falls due, with Open, Snooze and Done, and one
 * summary of those missed while the app was closed. Loaded after the shell is
 * up, so none of it weighs on startup.
 */

export default function ReminderHost() {
  const { vaultFs, vaultPath } = useVaultSession()
  const [due, setDue] = useState<ReminderRow[]>([])
  const [missed, setMissed] = useState<ReminderRow[]>([])
  const [missedOpen, setMissedOpen] = useState(false)
  const [canAsk, setCanAsk] = useState(
    () =>
      !isTauri() && typeof Notification !== 'undefined' && Notification.permission === 'default',
  )

  useEffect(() => {
    setDue([])
    setMissed([])
    // The phone app: Android shows reminders even while the app is closed, so
    // none are missed; Snooze and Done chosen there are written first.
    const phone = isTauri() && __MENTIS_MOBILE__
    let stop: (() => void) | null = null
    let cancelled = false
    const takeChoices = () =>
      import('@/lib/reminders/notification-actions')
        .then(({ applyNotificationActions }) => applyNotificationActions(vaultFs, vaultPath))
        .then((ids) => {
          const settled = new Set(ids)
          setDue((d) => d.filter((r) => !settled.has(reminderId(r))))
        })
        .catch((e) => console.warn('[reminders] applying notification choices failed:', e))
    const onVisible = () => {
      if (document.visibilityState === 'visible') void takeChoices()
    }
    void (async () => {
      if (phone) await takeChoices()
      if (cancelled) return
      stop = startReminders(vaultFs, vaultPath, {
        onDue: (rows) => {
          // Away from the phone app, Android's notification is the reminder.
          if (phone && document.visibilityState !== 'visible') return
          setDue((d) => [
            ...d.filter((x) => !rows.some((r) => reminderId(r) === reminderId(x))),
            ...rows,
          ])
        },
        onMissed: (rows) => !phone && setMissed(rows),
      })
    })()
    if (phone) document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      stop?.()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [vaultFs, vaultPath])

  const settle = useCallback(
    (rows: ReminderRow[], how: Settle) => {
      const ids = new Set(rows.map(reminderId))
      setDue((d) => d.filter((r) => !ids.has(reminderId(r))))
      settleReminders(vaultFs, vaultPath, rows, how).catch(() =>
        toast.error('Could not save the reminder.'),
      )
    },
    [vaultFs, vaultPath],
  )

  const drop = (row: ReminderRow) =>
    setDue((d) => d.filter((r) => reminderId(r) !== reminderId(row)))

  if (due.length === 0 && missed.length === 0) return null

  return createPortal(
    <div
      aria-live="polite"
      aria-label="Reminders"
      className="fixed top-[calc(1rem+env(safe-area-inset-top))] right-4 left-4 z-[9998] flex flex-col items-end gap-2 sm:left-auto"
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
                    onClick={() => openReminder(r)}
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
              className={reminderButton}
              onClick={() => {
                const rows = missed
                setMissed([])
                settle(rows, { done: true })
              }}
            >
              Done all
            </button>
          </div>
        </section>
      )}

      {due.map((r) => (
        <section
          key={reminderId(r)}
          role="alert"
          className="bg-bg-secondary border-accent/40 w-full rounded-lg border p-3 shadow-lg sm:w-[340px]"
        >
          <div className="mb-2 flex items-start gap-2">
            <BellRing className="text-accent mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-fg truncate text-sm font-medium">{r.title || 'Untitled'}</p>
              <p className="text-fg-muted text-xs">{describeReminder(r)}</p>
            </div>
            <button
              type="button"
              onClick={() => drop(r)}
              className="text-fg-muted hover:text-fg shrink-0"
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </button>
          </div>
          <ReminderActions row={r} onSettle={(how) => settle([r], how)} />
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
      ))}
    </div>,
    document.body,
  )
}
