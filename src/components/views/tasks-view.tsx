'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckSquare, Download, Loader2, Trash2 } from 'lucide-react'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { buildTaskTree, isDueToday, isDueThisWeek } from '@/lib/tasks'
import { exportTasksAsIcs } from '@/lib/tasks/ical'
import { useTasksStore } from '@/stores/tasks'
import { TaskListSidebar } from '@/components/tasks/task-list-sidebar'
import { TaskRow } from '@/components/tasks/task-row'
import { QuickAddBar } from '@/components/tasks/quick-add-bar'
import { TaskDetailDialog } from '@/components/tasks/task-detail-dialog'
import type { TaskItem } from '@/types/tasks'

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function TasksView() {
  const { vaultFs } = useVaultSession()
  const items = useTasksStore((s) => s.items)
  const loading = useTasksStore((s) => s.loading)
  const loadTasks = useTasksStore((s) => s.loadTasks)
  const activeList = useTasksStore((s) => s.activeList)
  const activeFilter = useTasksStore((s) => s.activeFilter)
  const clearCompleted = useTasksStore((s) => s.clearCompleted)

  const [editTask, setEditTask] = useState<TaskItem | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    void loadTasks(vaultFs)
  }, [vaultFs, loadTasks])

  const filtered = useMemo(() => {
    let pool = items

    if (activeFilter === 'today') {
      pool = pool.filter((i) => isDueToday(i) && i.status !== 'done' && i.status !== 'cancelled')
    } else if (activeFilter === 'upcoming') {
      pool = pool.filter((i) => isDueThisWeek(i) && i.status !== 'done' && i.status !== 'cancelled')
    } else if (activeList !== null) {
      pool = pool.filter((i) => i.list === activeList)
    } else {
      pool = pool.filter((i) => i.list === null)
    }

    return buildTaskTree(pool)
  }, [items, activeList, activeFilter])

  const doneCount = useMemo(() => {
    if (activeFilter === 'today' || activeFilter === 'upcoming') return 0
    const pool = activeList !== null
      ? items.filter((i) => i.list === activeList)
      : items.filter((i) => i.list === null)
    return pool.filter((i) => i.status === 'done').length
  }, [items, activeList, activeFilter])

  const handleEdit = useCallback((task: TaskItem) => {
    setEditTask(task)
    setDialogOpen(true)
  }, [])

  const handleExport = useCallback(() => {
    const tree = buildTaskTree(items)
    const ics = exportTasksAsIcs(tree)
    downloadFile(ics, 'tasks.ics', 'text/calendar')
  }, [items])

  const handleClearCompleted = useCallback(() => {
    const list = activeFilter === 'all' ? activeList : undefined
    void clearCompleted(vaultFs, list ?? undefined)
  }, [vaultFs, activeList, activeFilter, clearCompleted])

  const heading = activeFilter === 'today'
    ? 'Today'
    : activeFilter === 'upcoming'
      ? 'Upcoming'
      : activeList ?? 'Inbox'

  return (
    <div className="flex h-full min-h-0 w-full">
      <TaskListSidebar />

      <div className="flex min-h-0 flex-1 flex-col">
        {/* Header */}
        <div className="border-border bg-bg-secondary flex shrink-0 items-center justify-between border-b px-4 py-2.5">
          <h1 className="text-fg text-sm font-semibold">{heading}</h1>
          <div className="flex items-center gap-2">
            {doneCount > 0 && (
              <button
                type="button"
                onClick={handleClearCompleted}
                className="text-fg-muted hover:text-fg flex items-center gap-1.5 text-xs transition-colors"
                title="Clear completed tasks"
              >
                <Trash2 className="size-3.5" />
                Clear done ({doneCount})
              </button>
            )}
            <button
              type="button"
              onClick={handleExport}
              className="text-fg-muted hover:text-fg flex items-center gap-1.5 rounded-lg p-1.5 transition-colors"
              title="Export as .ics"
            >
              <Download className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Quick add */}
        <QuickAddBar />

        {/* Task list */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="text-fg-muted size-6 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6">
              <CheckSquare className="text-fg-muted/30 size-10" />
              <p className="text-fg-muted text-sm">
                {activeFilter === 'today'
                  ? 'Nothing due today.'
                  : activeFilter === 'upcoming'
                    ? 'Nothing coming up this week.'
                    : 'No tasks yet.'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col py-1">
              {filtered.map((task) => (
                <TaskRow key={task.path} item={task} onEdit={handleEdit} />
              ))}
            </div>
          )}
        </div>
      </div>

      <TaskDetailDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editTask}
      />
    </div>
  )
}
