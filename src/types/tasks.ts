export type TaskPriority = 1 | 2 | 3 | 4

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  1: 'Urgent',
  2: 'High',
  3: 'Normal',
  4: 'Low',
}

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  1: 'text-red-500',
  2: 'text-orange-500',
  3: 'text-blue-500',
  4: 'text-fg-muted',
}

export const PRIORITY_BG: Record<TaskPriority, string> = {
  1: 'bg-red-500',
  2: 'bg-orange-500',
  3: 'bg-blue-500',
  4: 'bg-zinc-400 dark:bg-zinc-600',
}

/** Matches `Date#getDay()` (0 = Sunday). */
export const WEEKDAY_LABEL: string[] = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

/**
 * A task: one checkbox line in a note, `- [ ] Call the bank >2026-10-30 09:00 !2 #money`.
 * Read from the note by `lib/tasks/line.ts`; the index keeps a derived copy.
 */
export interface TaskItem {
  /** `path:line`. Changes when lines above it move; the line's text finds it again. */
  id: string
  /** The note it is written in. */
  path: string
  /** 0-based line in the file when it was read. */
  line: number
  /** The whole line as written, to find it again after edits elsewhere. */
  raw: string
  /** Columns of indent; deeper checkbox lines under a task are its subtasks. */
  indent: number
  /** The text with the task tokens taken out; inline `#tags` stay in it. */
  title: string
  done: boolean
  /** `done:YYYY-MM-DD`. */
  completed: string | null
  /** `>YYYY-MM-DD`. */
  due: string | null
  /** `>YYYY-MM-DD HH:mm`: the time is when to remind. */
  time: string | null
  /** `!1`–`!4`; Normal (3) when none is written. */
  priority: TaskPriority
  tags: string[]
  /** `every monday`. */
  repeat: 'weekly' | null
  repeatWeekday: number | null
  /** `snooze:YYYY-MM-DDTHH:mm`: remind again then. */
  snoozeUntil: string | null
  /** The line of the task it is a subtask of. */
  parentLine: number | null
  children: TaskItem[]
}
