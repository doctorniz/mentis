import matter from 'gray-matter'
import type { FileSystemAdapter } from '@/lib/fs/types'
import type { ReminderRow } from '@/core/index/protocol'
import type { TaskItem } from '@/types/tasks'
import { isEventPath, parseCalendarEvent, parseEventDate } from '@/lib/calendar'
import { eventReminders, taskReminders } from '@/lib/reminders'

/** Every event file in the Calendar folder `dir`. A missing folder has none. */
async function eventFiles(fs: FileSystemAdapter, dir: string): Promise<string[]> {
  if (!(await fs.exists(dir))) return []
  return (await fs.readdir(dir)).map((e) => e.path).filter((p) => isEventPath(p, dir))
}

/**
 * Every reminder in [from, to] (and every snooze, whenever it falls): from
 * `tasks`, the vault's checkbox tasks, and from the event files in
 * `calendarFolder`. Unreadable files are skipped.
 */
export async function readReminderRows(
  fs: FileSystemAdapter,
  from: Date,
  to: Date,
  tasks: readonly TaskItem[],
  calendarFolder: string,
): Promise<ReminderRow[]> {
  const rows: ReminderRow[] = []
  for (const task of tasks) rows.push(...taskReminders(task, from, to))
  for (const path of await eventFiles(fs, calendarFolder)) {
    try {
      const event = parseCalendarEvent(path, await fs.readTextFile(path))
      rows.push(...eventReminders(event, from, to))
    } catch {
      /* skip unreadable */
    }
  }
  return rows.sort((a, b) => a.at.localeCompare(b.at) || a.path.localeCompare(b.path))
}

/** One occurrence's identity: the same in the window and in the shell. */
export const reminderId = (r: Pick<ReminderRow, 'path' | 'at'>) => `${r.path}@${r.at}`

/** The reminder's time as an instant. */
export const reminderTime = (r: Pick<ReminderRow, 'at'>) => parseEventDate(r.at)?.getTime() ?? NaN

/** A line saying what the reminder is about, for a notification or a card. */
export function describeReminder(r: ReminderRow, now = new Date()): string {
  if (r.kind === 'journal') return 'Nothing written today yet'
  const when = parseEventDate(r.about)
  if (!when) return r.kind === 'event' ? 'Event' : 'Task'
  const time = when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const sameDay = when.toDateString() === now.toDateString()
  const day = sameDay
    ? 'today'
    : when.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  return r.kind === 'event' ? `Starts ${day}, ${time}` : `Task · ${day}, ${time}`
}

/**
 * Record Done or Snooze in the item's file: `fields` are `reminderAck` and
 * `snoozeUntil`; an empty one is removed. Everything else in the file stays.
 */
export async function settleReminder(
  fs: FileSystemAdapter,
  path: string,
  fields: { reminderAck: string; snoozeUntil: string },
): Promise<void> {
  const { data, content } = matter(await fs.readTextFile(path))
  for (const [key, value] of Object.entries(fields)) {
    if (value) data[key] = value
    else delete data[key]
  }
  await fs.writeTextFile(path, matter.stringify(content, data))
}
