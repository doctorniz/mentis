export type TaskStatus = 'todo' | 'in-progress' | 'done' | 'cancelled'
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

export interface TaskFrontmatter {
  uid: string
  status: TaskStatus
  priority: TaskPriority
  due: string
  created: string
  modified: string
  completed: string
  tags: string[]
  parent: string
  order: number
  /** CalDAV-style weekly repeat; `repeatWeekday` uses `Date#getDay()` (0=Sun … 6=Sat). */
  repeat?: 'weekly' | ''
  repeatWeekday?: number
  [key: string]: unknown
}

export interface TaskItem {
  path: string
  uid: string
  title: string
  body: string
  status: TaskStatus
  priority: TaskPriority
  due: string | null
  created: string
  modified: string
  completed: string | null
  tags: string[]
  list: string | null
  parent: string | null
  order: number
  repeat: 'weekly' | null
  repeatWeekday: number | null
  children: TaskItem[]
}
