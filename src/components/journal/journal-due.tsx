import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { compareTasks } from '@/lib/tasks'
import { nestTasks } from '@/lib/tasks/line'
import { formatLocalDate } from '@/lib/tasks/recurrence'
import { useTasksStore } from '@/stores/tasks'
import { TaskRow } from '@/components/tasks/task-row'
import { TaskDetailDialog } from '@/components/tasks/task-detail-dialog'
import type { TaskItem } from '@/types/tasks'

/**
 * Open tasks due on the journal's day, from any note; today's page adds the
 * overdue ones. Nothing shows when none are due.
 */
export function JournalDue({ date }: { date: string }) {
  const items = useTasksStore((s) => s.items)
  const loaded = useTasksStore((s) => s.loaded)
  const loadTasks = useTasksStore((s) => s.loadTasks)
  const [open, setOpen] = useState(true)
  const [editTask, setEditTask] = useState<TaskItem | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    if (!loaded) void loadTasks()
  }, [loaded, loadTasks])

  const today = formatLocalDate(new Date())
  const due = useMemo(() => {
    const isDue = (t: TaskItem) =>
      !t.done && t.due && (t.due === date || (date === today && t.due < date))
    // Each task with its open subtasks under it; a due subtask shows under its parent
    // when the parent is due too, and on its own otherwise.
    const nested = new Map<string, TaskItem>()
    const walk = (t: TaskItem): TaskItem => {
      const node = { ...t, children: t.children.filter((c) => !c.done).map(walk) }
      nested.set(t.id, node)
      return node
    }
    nestTasks(items).forEach(walk)
    const byId = new Map(items.map((t) => [t.id, t]))
    return items
      .filter((t) => {
        if (!isDue(t)) return false
        const parent = t.parentLine != null ? byId.get(`${t.path}:${t.parentLine}`) : undefined
        return !(parent && isDue(parent))
      })
      .map((t) => nested.get(t.id) ?? t)
      .sort(compareTasks)
  }, [items, date, today])

  if (due.length === 0) return null

  return (
    <section aria-label="Due" className="border-border border-b px-2 py-1 md:px-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="text-fg-muted hover:text-fg flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold tracking-wide uppercase"
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        Due · {due.length}
      </button>
      {open && (
        <div className="max-h-48 overflow-y-auto">
          {due.map((task) => (
            <TaskRow
              key={task.id}
              item={task}
              showNote
              onEdit={(t) => {
                setEditTask(t)
                setDialogOpen(true)
              }}
            />
          ))}
        </div>
      )}
      <TaskDetailDialog open={dialogOpen} onOpenChange={setDialogOpen} task={editTask} />
    </section>
  )
}
