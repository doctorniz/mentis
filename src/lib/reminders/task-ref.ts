import type { TaskItem } from '@/types/tasks'

/**
 * What a task's reminder points at: its note and its line as written. Line
 * numbers move when the note is edited above the task; the text finds it
 * again. The line changes when the task does, and so does its reminder.
 */
export const taskRef = (t: Pick<TaskItem, 'path' | 'raw'>) => `${t.path}\n${t.raw}`

export function parseTaskRef(ref: string): { path: string; raw: string } | null {
  const at = ref.indexOf('\n')
  return at > 0 ? { path: ref.slice(0, at), raw: ref.slice(at + 1) } : null
}
