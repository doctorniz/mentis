import type { TaskItem } from '@/types/tasks'

/** Local calendar start (00:00) for `d` in the user's timezone. */
export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function parseLocalDate(isoDate: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const day = Number(m[3])
  const dt = new Date(y, mo, day)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== day) return null
  return dt
}

export function formatLocalDate(d: Date): string {
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}

/** Next occurrence of `weekday` (0=Sun … 6=Sat, same as `Date#getDay`) on or after calendar day of `ref`. */
export function nextWeekdayOnOrAfter(ref: Date, weekday: number): Date {
  const start = startOfLocalDay(ref)
  const diff = (weekday - start.getDay() + 7) % 7
  const out = new Date(start)
  out.setDate(out.getDate() + diff)
  return out
}

/**
 * After completing a weekly task, the next due date: strictly after the completion calendar day,
 * on the configured weekday.
 */
export function nextWeeklyDueAfterCompletion(completedAt: Date, weekday: number): string {
  const dayAfter = startOfLocalDay(completedAt)
  dayAfter.setDate(dayAfter.getDate() + 1)
  return formatLocalDate(nextWeekdayOnOrAfter(dayAfter, weekday))
}

/** Effective due for filters / display: handles stale `due` for weekly tasks. */
export function getEffectiveDueDate(task: TaskItem, ref: Date = new Date()): string | null {
  if (task.repeat !== 'weekly' || task.repeatWeekday == null) {
    return task.due
  }
  const start = startOfLocalDay(ref)
  if (task.due) {
    const stored = parseLocalDate(task.due)
    if (stored && stored >= start) {
      return task.due
    }
  }
  return formatLocalDate(nextWeekdayOnOrAfter(ref, task.repeatWeekday))
}

export function isSameLocalDay(a: Date, isoDate: string): boolean {
  const d = parseLocalDate(isoDate)
  if (!d) return false
  return (
    a.getFullYear() === d.getFullYear() &&
    a.getMonth() === d.getMonth() &&
    a.getDate() === d.getDate()
  )
}
