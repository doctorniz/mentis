import type { TaskItem } from '@/types/tasks'
import { parseLocalDate, startOfLocalDay } from '@/lib/tasks/recurrence'

/** The note new tasks are added to when no note is named. */
export const DEFAULT_TASK_INBOX = 'Inbox.md'

/** Days from today to `due` (negative when past), counted in local calendar days. */
function daysUntil(due: string, now: Date): number | null {
  const d = parseLocalDate(due)
  if (!d) return null
  // Rounding absorbs the 23h/25h days on either side of a DST change.
  return Math.round((d.getTime() - startOfLocalDay(now).getTime()) / 86_400_000)
}

export function isOverdue(task: Pick<TaskItem, 'done' | 'due'>, now = new Date()): boolean {
  if (task.done || !task.due) return false
  const days = daysUntil(task.due, now)
  return days !== null && days < 0
}

export function isDueToday(task: Pick<TaskItem, 'due'>, now = new Date()): boolean {
  return task.due ? daysUntil(task.due, now) === 0 : false
}

/** Badge text for a `YYYY-MM-DD` due date, counted in local calendar days. */
export function formatDueLabel(due: string, now: Date = new Date()): string {
  const d = parseLocalDate(due)
  const days = daysUntil(due, now)
  if (!d || days === null) return due
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'short' })
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export type DateGroup = 'Overdue' | 'Today' | 'Next 7 days' | 'Later' | 'No date'
export const DATE_GROUPS: readonly DateGroup[] = [
  'Overdue',
  'Today',
  'Next 7 days',
  'Later',
  'No date',
]

/** Which By date section an open task belongs in. */
export function dateGroupOf(task: Pick<TaskItem, 'due'>, now = new Date()): DateGroup {
  const days = task.due ? daysUntil(task.due, now) : null
  if (days === null) return 'No date'
  if (days < 0) return 'Overdue'
  if (days === 0) return 'Today'
  if (days <= 7) return 'Next 7 days'
  return 'Later'
}

/** Earliest due first (undated last), then most urgent, then as written. */
export function compareTasks(a: TaskItem, b: TaskItem): number {
  const ad = a.due ?? '9999-99-99'
  const bd = b.due ?? '9999-99-99'
  if (ad !== bd) return ad < bd ? -1 : 1
  if ((a.time ?? '') !== (b.time ?? '')) return (a.time ?? '99') < (b.time ?? '99') ? -1 : 1
  if (a.priority !== b.priority) return a.priority - b.priority
  return a.path === b.path ? a.line - b.line : a.path.localeCompare(b.path)
}
