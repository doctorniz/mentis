import type { FileSystemAdapter } from '@/lib/fs/types'
import type { ReminderRow } from '@/core/index/protocol'
import { toDateTimeStr } from '@/lib/calendar'
import { useUiStore } from '@/stores/ui'
import { useTasksStore } from '@/stores/tasks'
import { useCalendarStore } from '@/stores/calendar'
import { useJournalStore } from '@/stores/journal'
import { settleReminder } from './sources'
import { requestOpen } from './open'
import { loadJournalPromptState, saveJournalPromptState } from './journal-prompt'

/**
 * What can be done with a reminder, wherever it shows: Open its item, Done,
 * or Snooze. Done and Snooze are written into the item's file (`reminderAck`,
 * `snoozeUntil`), except the journal prompt's, which has no file yet.
 */

export const SNOOZES: Array<{ label: string; until: (now: Date) => Date }> = [
  { label: '10 minutes', until: (now) => new Date(now.getTime() + 10 * 60_000) },
  { label: '1 hour', until: (now) => new Date(now.getTime() + 60 * 60_000) },
  {
    label: 'Tomorrow 9:00',
    until: (now) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0),
  },
]

export type Settle = { done: true } | { done: false; until: Date }

/** Show the reminder's item: the task, the event, or the day's journal. */
export function openReminder(row: ReminderRow): void {
  if (row.kind === 'journal') {
    useJournalStore.getState().openDay(row.at.slice(0, 10))
    return
  }
  useUiStore.getState().setActiveView('organizer')
  requestOpen(row.kind, row.path)
}

/**
 * Done or Snooze for `rows`. Done covers every occurrence of an item up to
 * now, or up to the latest of `rows` when that is still to come (Done on an
 * upcoming reminder skips it). Snooze also settles everything up to now.
 */
export async function settleReminders(
  fs: FileSystemAdapter,
  vaultKey: string,
  rows: readonly ReminderRow[],
  how: Settle,
  now = new Date(),
): Promise<void> {
  const nowAt = toDateTimeStr(now)
  const latest = new Map<string, string>()
  for (const r of rows) latest.set(r.path, [latest.get(r.path) ?? '', r.at].sort()[1]!)

  for (const [path, at] of latest) {
    const row = rows.find((r) => r.path === path)!
    if (row.kind === 'journal') {
      // A snooze past the day is Done for the day: the prompt is only ever today's.
      const day = at.slice(0, 10)
      const until = how.done ? '' : toDateTimeStr(how.until)
      saveJournalPromptState(
        vaultKey,
        how.done || !until.startsWith(day)
          ? { done: day }
          : { ...loadJournalPromptState(vaultKey), snoozeUntil: until },
      )
      continue
    }
    await settleReminder(fs, path, {
      reminderAck: how.done && at > nowAt ? at : nowAt,
      snoozeUntil: how.done ? '' : toDateTimeStr(how.until),
    })
  }

  const paths = [...latest.keys()]
  const tasks = useTasksStore.getState()
  if (tasks.items.some((t) => paths.includes(t.path))) await tasks.loadTasks(fs)
  const calendar = useCalendarStore.getState()
  if (calendar.events.some((e) => paths.includes(e.path))) await calendar.loadEvents(fs)
  window.dispatchEvent(new CustomEvent('ink:vault-changed'))
}
