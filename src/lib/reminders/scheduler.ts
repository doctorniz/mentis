import type { FileSystemAdapter } from '@/lib/fs/types'
import type { ReminderRow } from '@/core/index/protocol'
import { isTauri } from '@/lib/fs/platform'
import { getReminderRows, putReminderRows } from '@/lib/search'
import { useTasksStore } from '@/stores/tasks'
import { useCalendarStore } from '@/stores/calendar'
import { toDateTimeStr } from '@/lib/calendar'
import { describeReminder, readReminderRows, reminderId, reminderTime } from './sources'
import { requestOpen } from './open'

/**
 * Delivers reminders while a vault is open. The occurrences come from the
 * task and event files, kept in the index so a launch can schedule before the
 * files are read again. In a browser this module times them; on the desktop
 * the shell does (a hidden window's timers are throttled) and this module
 * hands it the next ones.
 *
 * A reminder that fell due while the app was closed is missed: on the next
 * launch they are offered together. When the app last looked is remembered
 * per vault in this browser, which is a convenience, not data: losing it at
 * worst skips one summary.
 */

export interface ReminderHandlers {
  /** Reminders falling due now. */
  onDue(rows: ReminderRow[]): void
  /** Reminders that fell due while the app was closed. */
  onMissed(rows: ReminderRow[]): void
}

const DAY = 86_400_000
/** How far back a missed reminder is still worth offering. */
const MISSED_REACH = 7 * DAY
/** How far ahead occurrences are worked out and recorded. */
const AHEAD = 30 * DAY
/** How far ahead the desktop shell is told about. */
const SHELL_AHEAD = 2 * DAY
const TICK = 30_000
/** Work the occurrences out again this often, so the window moves on. */
const REFRESH = 60 * 60_000

const seenKey = (vaultKey: string) => `mentis.reminders.seen:${vaultKey}`

function loadSeen(vaultKey: string): number | null {
  try {
    const v = Number(localStorage.getItem(seenKey(vaultKey)))
    return v > 0 ? v : null
  } catch {
    return null
  }
}

function saveSeen(vaultKey: string, ms: number) {
  try {
    localStorage.setItem(seenKey(vaultKey), String(ms))
  } catch {
    /* not kept: at worst one summary is skipped */
  }
}

/** The occurrences with `after < time <= upTo`. */
export function dueBetween(rows: readonly ReminderRow[], after: number, upTo: number) {
  return rows.filter((r) => {
    const t = reminderTime(r)
    return t > after && t <= upTo
  })
}

function showSystemNotification(row: ReminderRow) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try {
    const n = new Notification(row.title || 'Reminder', {
      body: describeReminder(row),
      tag: reminderId(row),
    })
    n.onclick = () => {
      window.focus()
      requestOpen(row.kind, row.path)
      n.close()
    }
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}

/** Start delivering the open vault's reminders. Returns a stop function. */
export function startReminders(
  vaultFs: FileSystemAdapter,
  vaultKey: string,
  handlers: ReminderHandlers,
): () => void {
  const desktop = isTauri()
  let stopped = false
  let rows: ReminderRow[] = []
  const fired = new Set<string>()
  const cleanups: Array<() => void> = []
  let lastTick = Date.now()
  let tickTimer: ReturnType<typeof setTimeout> | undefined
  let reconcileTimer: ReturnType<typeof setTimeout> | undefined

  function fire(due: ReminderRow[]) {
    const fresh = due.filter((r) => !fired.has(reminderId(r)))
    if (fresh.length === 0) return
    for (const r of fresh) {
      fired.add(reminderId(r))
      if (!desktop) showSystemNotification(r)
    }
    handlers.onDue(fresh)
  }

  function tick() {
    if (stopped) return
    const now = Date.now()
    fire(dueBetween(rows, lastTick, now))
    lastTick = now
    saveSeen(vaultKey, now)
    const next = rows.map(reminderTime).find((t) => t > now)
    tickTimer = setTimeout(tick, Math.max(1000, Math.min(TICK, (next ?? Infinity) - now)))
  }

  async function tellShell() {
    if (!desktop) return
    const now = Date.now()
    const items = rows
      .filter((r) => {
        const t = reminderTime(r)
        return t > now && t <= now + SHELL_AHEAD
      })
      .map((r) => ({
        id: reminderId(r),
        atMs: reminderTime(r),
        title: r.title || 'Reminder',
        body: describeReminder(r),
      }))
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('reminders_schedule', { items })
  }

  function adopt(next: ReminderRow[]) {
    rows = next
    clearTimeout(tickTimer)
    tick()
    void tellShell().catch(() => {})
  }

  async function reconcile(): Promise<ReminderRow[]> {
    const now = Date.now()
    const next = await readReminderRows(
      vaultFs,
      new Date(now - MISSED_REACH),
      new Date(now + AHEAD),
    )
    if (stopped) return next
    adopt(next)
    void putReminderRows(next).catch(() => {})
    return next
  }

  function reconcileSoon() {
    clearTimeout(reconcileTimer)
    reconcileTimer = setTimeout(() => void reconcile().catch(() => {}), 500)
  }

  void (async () => {
    const start = Date.now()
    const seen = loadSeen(vaultKey) ?? start
    lastTick = start
    // What was recorded last time, so reminders are timed before the files are read.
    const recorded = await getReminderRows(
      toDateTimeStr(new Date(start - MISSED_REACH)),
      toDateTimeStr(new Date(start + AHEAD)),
    ).catch(() => [])
    if (stopped) return
    if (recorded.length) adopt(recorded)
    const current = await reconcile().catch(() => rows)
    if (stopped) return
    const missed = dueBetween(current, Math.max(seen, start - MISSED_REACH), start)
    for (const r of missed) fired.add(reminderId(r))
    if (missed.length) handlers.onMissed(missed)
    saveSeen(vaultKey, Math.max(start, lastTick))
  })()

  // The files change: through the views here, or from elsewhere.
  const onVaultChanged = () => reconcileSoon()
  window.addEventListener('ink:vault-changed', onVaultChanged)
  cleanups.push(() => window.removeEventListener('ink:vault-changed', onVaultChanged))
  cleanups.push(useTasksStore.subscribe((s, p) => s.items !== p.items && reconcileSoon()))
  cleanups.push(useCalendarStore.subscribe((s, p) => s.events !== p.events && reconcileSoon()))
  const refresh = setInterval(reconcileSoon, REFRESH)
  cleanups.push(() => clearInterval(refresh))

  if (desktop) {
    void import('@tauri-apps/api/event').then(async ({ listen }) => {
      const off = await listen<string>('reminder-fired', (e) => {
        fire(rows.filter((r) => reminderId(r) === e.payload))
      })
      if (stopped) off()
      else cleanups.push(off)
    })
  }

  return () => {
    stopped = true
    clearTimeout(tickTimer)
    clearTimeout(reconcileTimer)
    for (const c of cleanups) c()
    if (desktop) {
      void import('@tauri-apps/api/core')
        .then(({ invoke }) => invoke('reminders_schedule', { items: [] }))
        .catch(() => {})
    }
  }
}
