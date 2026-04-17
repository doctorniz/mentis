import type { TaskItem } from '@/types/tasks'
import type { TaskPriority } from '@/types/tasks'

const PRIORITY_MAP: Record<TaskPriority, number> = { 1: 1, 2: 3, 3: 5, 4: 9 }

const STATUS_MAP: Record<string, string> = {
  'todo': 'NEEDS-ACTION',
  'in-progress': 'IN-PROCESS',
  'done': 'COMPLETED',
  'cancelled': 'CANCELLED',
}

function foldLine(line: string): string {
  const parts: string[] = []
  let i = 0
  while (i < line.length) {
    parts.push(line.slice(i, i + 75))
    i += 75
  }
  return parts.join('\r\n ')
}

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function formatUtc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
}

function formatDateOnly(iso: string): string {
  return iso.replace(/-/g, '')
}

const ICAL_BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const

export function taskToVTodo(item: TaskItem): string {
  const lines: string[] = [
    'BEGIN:VTODO',
    foldLine(`UID:${item.uid}`),
    foldLine(`SUMMARY:${escapeText(item.title)}`),
    `STATUS:${STATUS_MAP[item.status] ?? 'NEEDS-ACTION'}`,
    `PRIORITY:${PRIORITY_MAP[item.priority] ?? 5}`,
    foldLine(`CREATED:${formatUtc(item.created)}`),
    foldLine(`LAST-MODIFIED:${formatUtc(item.modified)}`),
  ]

  if (item.due) {
    lines.push(`DUE;VALUE=DATE:${formatDateOnly(item.due)}`)
  }

  if (item.repeat === 'weekly' && item.repeatWeekday != null) {
    lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${ICAL_BYDAY[item.repeatWeekday]}`)
  }

  if (item.completed) {
    lines.push(foldLine(`COMPLETED:${formatUtc(item.completed)}`))
  }

  if (item.body.trim()) {
    lines.push(foldLine(`DESCRIPTION:${escapeText(item.body.trim())}`))
  }

  if (item.tags.length) {
    lines.push(foldLine(`CATEGORIES:${item.tags.join(',')}`))
  }

  if (item.parent) {
    lines.push(foldLine(`RELATED-TO;RELTYPE=PARENT:${item.parent}`))
  }

  lines.push('END:VTODO')
  return lines.join('\r\n')
}

export function exportTasksAsIcs(items: TaskItem[]): string {
  const flat = flattenTasks(items)
  const vtodos = flat.map(taskToVTodo).join('\r\n')
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mentis//Tasks//EN',
    vtodos,
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}

function flattenTasks(items: TaskItem[]): TaskItem[] {
  const result: TaskItem[] = []
  for (const item of items) {
    result.push(item)
    if (item.children.length) {
      result.push(...flattenTasks(item.children))
    }
  }
  return result
}
