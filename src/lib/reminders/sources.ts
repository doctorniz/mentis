import matter from 'gray-matter'
import type { FileSystemAdapter } from '@/lib/fs/types'
import type { ReminderRow } from '@/core/index/protocol'
import type { TaskItem } from '@/types/tasks'
import { CALENDAR_DIR, parseCalendarEvent, parseEventDate } from '@/lib/calendar'
import { eventReminders, taskReminders } from '@/lib/reminders'

/** Every Markdown file under `dir`, at any depth. A missing folder has none. */
async function markdownFiles(fs: FileSystemAdapter, dir: string): Promise<string[]> {
  if (!(await fs.exists(dir))) return []
  const out: string[] = []
  for (const e of await fs.readdir(dir)) {
    if (e.isDirectory) out.push(...(await markdownFiles(fs, e.path)))
    else if (e.name.endsWith('.md')) out.push(e.path)
  }
  return out
}

/**
 * Every reminder in [from, to] (and every snooze, whenever it falls): from
 * `tasks`, the vault's checkbox tasks, and from the event files. Unreadable
 * files are skipped.
 */
export async function readReminderRows(
  fs: FileSystemAdapter,
  from: Date,
  to: Date,
  tasks: readonly TaskItem[],
): Promise<ReminderRow[]> {
  const rows: ReminderRow[] = []
  const read = async (dir: string, toRows: (path: string, raw: string) => ReminderRow[]) => {
    for (const path of await markdownFiles(fs, dir)) {
      try {
        rows.push(...toRows(path, await fs.readTextFile(path)))
      } catch {
        /* skip unreadable */
      }
    }
  }
  for (const task of tasks) rows.push(...taskReminders(task, from, to))
  await read(CALENDAR_DIR, (path, raw) => eventReminders(parseCalendarEvent(path, raw), from, to))
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
