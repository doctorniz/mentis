import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckSquare, Loader2 } from 'lucide-react'
import { compareTasks, DATE_GROUPS, dateGroupOf, type DateGroup } from '@/lib/tasks'
import { nestTasks } from '@/lib/tasks/line'
import { useTasksStore } from '@/stores/tasks'
import { noteName, TaskRow } from '@/components/tasks/task-row'
import { CaptureBar } from '@/modules/capture/capture-bar'
import { TaskDetailDialog } from '@/components/tasks/task-detail-dialog'
import { useRememberedTab } from '@/components/views/view-tabs'
import type { TaskItem } from '@/types/tasks'
import { OPEN_REMINDER_EVENT, takeOpen } from '@/lib/reminders/open'
import { taskRef } from '@/lib/reminders/task-ref'
import { cn } from '@/utils/cn'

const GROUPINGS = ['date', 'note'] as const
type Grouping = (typeof GROUPINGS)[number]

interface Section {
  key: string
  title: string
  tasks: TaskItem[]
}

/** Open tasks under By date's headings; a subtask stays under its parent. */
function byDate(roots: TaskItem[], now: Date): Section[] {
  const groups = new Map<DateGroup, TaskItem[]>(DATE_GROUPS.map((g) => [g, []]))
  for (const t of roots) groups.get(dateGroupOf(t, now))!.push(t)
  return DATE_GROUPS.map((g) => ({
    key: g,
    title: g,
    tasks: groups.get(g)!.sort(compareTasks),
  })).filter((s) => s.tasks.length > 0)
}

/** Tasks under the note they are written in, in the order written; notes by name. */
function byNote(roots: TaskItem[]): Section[] {
  const notes = new Map<string, TaskItem[]>()
  for (const t of roots) notes.set(t.path, [...(notes.get(t.path) ?? []), t])
  return [...notes]
    .map(([path, tasks]) => ({ key: path, title: noteName(path), tasks }))
    .sort((a, b) => a.title.localeCompare(b.title))
}

/** Every checkbox task in the vault, grouped By date or By note. */
export function TasksView() {
  const items = useTasksStore((s) => s.items)
  const loading = useTasksStore((s) => s.loading)
  const loadTasks = useTasksStore((s) => s.loadTasks)

  const [grouping, setGrouping] = useRememberedTab<Grouping>(
    'ink-tasks-grouping',
    GROUPINGS,
    'date',
  )
  const [showDone, setShowDone] = useState(false)
  const [editTask, setEditTask] = useState<TaskItem | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  // A reminder's Open: show the task once it is loaded.
  useEffect(() => {
    function openRequested() {
      const ref = takeOpen('task', (r) => items.some((t) => taskRef(t) === r))
      const task = ref && items.find((t) => taskRef(t) === ref)
      if (!task) return
      setEditTask(task)
      setDialogOpen(true)
    }
    openRequested()
    window.addEventListener(OPEN_REMINDER_EVENT, openRequested)
    return () => window.removeEventListener(OPEN_REMINDER_EVENT, openRequested)
  }, [items])

  useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  const doneCount = useMemo(() => items.filter((t) => t.done).length, [items])

  const sections = useMemo(() => {
    // A done parent hides its subtasks with it; an open one keeps its done ones.
    const roots = nestTasks(items).filter((t) => showDone || !t.done)
    const prune = (t: TaskItem): TaskItem => ({
      ...t,
      children: t.children.filter((c) => showDone || !c.done).map(prune),
    })
    const shown = roots.map(prune)
    return grouping === 'date' ? byDate(shown, new Date()) : byNote(shown)
  }, [items, grouping, showDone])

  const handleEdit = useCallback((task: TaskItem) => {
    setEditTask(task)
    setDialogOpen(true)
  }, [])

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div className="border-border bg-bg-secondary flex shrink-0 items-center gap-2 border-b px-3 py-2 md:px-4">
        <div className="bg-bg-tertiary flex rounded-lg p-0.5" role="radiogroup" aria-label="Group">
          {GROUPINGS.map((g) => (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={grouping === g}
              onClick={() => setGrouping(g)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                grouping === g ? 'bg-bg text-fg shadow-sm' : 'text-fg-secondary hover:text-fg',
              )}
            >
              {g === 'date' ? 'By date' : 'By note'}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        {doneCount > 0 && (
          <button
            type="button"
            aria-pressed={showDone}
            onClick={() => setShowDone((v) => !v)}
            className="text-fg-muted hover:text-fg rounded-lg px-2 py-1.5 text-xs transition-colors"
          >
            {showDone ? 'Hide done' : `Show done (${doneCount})`}
          </button>
        )}
      </div>

      {/* Quick add: the capture bar, bound to tasks. `/` still picks another destination. */}
      <CaptureBar boundDestination="task" immediate placeholder="Add a task..." />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="text-fg-muted size-6 animate-spin" />
          </div>
        ) : sections.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6">
            <CheckSquare className="text-fg-muted/30 size-10" />
            <p className="text-fg-muted text-sm">No tasks yet.</p>
          </div>
        ) : (
          <div className="px-2 pb-4 md:px-4">
            {sections.map((s) => (
              <section key={s.key} aria-label={s.title}>
                <h2 className="text-fg-muted px-4 pt-4 pb-1 text-xs font-semibold tracking-wide uppercase">
                  {s.title}
                </h2>
                {s.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    item={task}
                    onEdit={handleEdit}
                    showNote={grouping === 'date'}
                  />
                ))}
              </section>
            ))}
          </div>
        )}
      </div>

      <TaskDetailDialog open={dialogOpen} onOpenChange={setDialogOpen} task={editTask} />
    </div>
  )
}
