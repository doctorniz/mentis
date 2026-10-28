import { useCallback, useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { FileText, Loader2, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { useTasksStore } from '@/stores/tasks'
import { useEditorStore } from '@/stores/editor'
import { useUiStore } from '@/stores/ui'
import { toast } from '@/stores/toast'
import type { TaskItem, TaskPriority } from '@/types/tasks'
import { PRIORITY_LABELS, PRIORITY_BG, WEEKDAY_LABEL } from '@/types/tasks'
import { noteName } from '@/components/tasks/task-row'
import { cn } from '@/utils/cn'

const PRIORITIES: TaskPriority[] = [1, 2, 3, 4]
const FIELD =
  'border-border bg-bg-secondary text-fg focus:ring-accent/40 w-full max-w-full min-w-0 rounded-lg border px-3 py-1.5 text-sm outline-none focus:ring-1'

/** Show the note a task is written in, in the editor. */
function openNote(path: string) {
  useEditorStore.getState().setPendingVaultOpenPath(path)
  useUiStore.getState().setActiveView('vault')
}

/** Edit one task: everything here is written back into its line in the note. */
export function TaskDetailDialog({
  open,
  onOpenChange,
  task,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: TaskItem | null
}) {
  const { vaultFs } = useVaultSession()
  const updateTask = useTasksStore((s) => s.updateTask)
  const removeTask = useTasksStore((s) => s.removeTask)
  const addSubtask = useTasksStore((s) => s.addSubtask)
  const toggleTask = useTasksStore((s) => s.toggleTask)
  const items = useTasksStore((s) => s.items)

  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<TaskPriority>(3)
  const [due, setDue] = useState('')
  const [time, setTime] = useState('')
  const [weekday, setWeekday] = useState('')
  const [saving, setSaving] = useState(false)
  const [subtaskTitle, setSubtaskTitle] = useState('')

  // The task as it is now: the store's copy moves when lines above it change.
  const current = task
    ? (items.find((i) => i.path === task.path && i.raw === task.raw) ?? task)
    : null
  const children = current
    ? items.filter((i) => i.path === current.path && i.parentLine === current.line)
    : []

  useEffect(() => {
    if (!open || !task) return
    setTitle(task.title)
    setPriority(task.priority)
    setDue(task.due ?? '')
    setTime(task.time ?? '')
    setWeekday(task.repeatWeekday != null ? String(task.repeatWeekday) : '')
    setSubtaskTitle('')
  }, [open, task])

  const run = useCallback(async (what: () => Promise<void>) => {
    try {
      await what()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const handleSave = useCallback(async () => {
    if (!current) return
    setSaving(true)
    await run(() =>
      updateTask(vaultFs, current, {
        title: title.trim(),
        priority,
        due: due || null,
        time: due && time ? time : null,
        repeatWeekday: weekday === '' ? null : Number(weekday),
        // A new reminder time starts fresh: an old snooze must not swallow it.
        ...(time !== (current.time ?? '') || due !== (current.due ?? '')
          ? { snoozeUntil: null }
          : {}),
      }),
    )
    setSaving(false)
    onOpenChange(false)
  }, [current, title, priority, due, time, weekday, vaultFs, updateTask, onOpenChange, run])

  const handleDelete = useCallback(async () => {
    if (!current) return
    await run(() => removeTask(vaultFs, current))
    onOpenChange(false)
  }, [current, vaultFs, removeTask, onOpenChange, run])

  const handleAddSubtask = useCallback(async () => {
    if (!current || !subtaskTitle.trim()) return
    await run(() => addSubtask(vaultFs, current, subtaskTitle.trim()))
    setSubtaskTitle('')
  }, [current, subtaskTitle, vaultFs, addSubtask, run])

  if (!current) return null

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby={undefined}
          className="bg-bg border-border fixed top-1/2 left-1/2 z-50 flex max-h-[min(90dvh,44rem)] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border shadow-xl"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void handleSave()
            }
          }}
        >
          <div className="border-border flex shrink-0 items-center justify-between border-b px-5 py-3">
            <Dialog.Title className="text-fg text-sm font-semibold">Edit Task</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="text-fg-muted hover:text-fg rounded-md p-1"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              aria-label="Task title"
              className="text-fg placeholder:text-fg-muted/40 w-full bg-transparent text-lg font-semibold outline-none"
            />

            <button
              type="button"
              onClick={() => {
                onOpenChange(false)
                openNote(current.path)
              }}
              className="text-fg-secondary hover:text-fg flex items-center gap-1.5 self-start text-xs"
            >
              <FileText className="size-3.5" aria-hidden />
              Open in {noteName(current.path)}
            </button>

            <div className="min-w-0">
              <span className="text-fg-secondary mb-1 block text-xs font-medium">Priority</span>
              <div className="flex flex-wrap gap-1.5">
                {PRIORITIES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                      priority === p
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border text-fg-secondary hover:border-border-strong',
                    )}
                  >
                    <span className={cn('size-2 rounded-full', PRIORITY_BG[p])} />
                    {PRIORITY_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <label className="min-w-0">
                <span className="text-fg-secondary mb-1 block text-xs font-medium">Due date</span>
                <input
                  type="date"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                  className={FIELD}
                />
              </label>
              <label className="min-w-0">
                <span className="text-fg-secondary mb-1 block text-xs font-medium">Remind at</span>
                <input
                  type="time"
                  value={time}
                  disabled={!due}
                  onChange={(e) => setTime(e.target.value)}
                  className={cn(FIELD, 'disabled:opacity-40')}
                />
              </label>
              <label className="min-w-0">
                <span className="text-fg-secondary mb-1 block text-xs font-medium">Repeat</span>
                <select
                  value={weekday}
                  onChange={(e) => setWeekday(e.target.value)}
                  className={FIELD}
                >
                  <option value="">Never</option>
                  {WEEKDAY_LABEL.map((label, i) => (
                    <option key={label} value={i}>
                      Every {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <span className="text-fg-secondary mb-1.5 block text-xs font-medium">
                Subtasks{' '}
                {children.length > 0 &&
                  `(${children.filter((c) => c.done).length}/${children.length})`}
              </span>
              <div className="flex flex-col gap-1">
                {children.map((child) => (
                  <div key={child.id} className="flex items-center gap-2 px-1">
                    <button
                      type="button"
                      onClick={() => void run(() => toggleTask(vaultFs, child))}
                      aria-label={child.done ? 'Mark incomplete' : 'Mark complete'}
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                        child.done
                          ? 'border-accent bg-accent'
                          : 'border-border hover:border-accent',
                      )}
                    >
                      {child.done && (
                        <svg viewBox="0 0 12 12" className="text-accent-fg size-2.5" aria-hidden>
                          <path
                            d="M2 6l3 3 5-5"
                            stroke="currentColor"
                            strokeWidth="2"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </button>
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate text-sm',
                        child.done && 'text-fg-muted line-through',
                      )}
                    >
                      {child.title || 'Untitled'}
                    </span>
                    <button
                      type="button"
                      onClick={() => void run(() => removeTask(vaultFs, child))}
                      aria-label="Delete subtask"
                      className="text-fg-muted/30 hover:text-danger rounded p-0.5"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <Plus className="text-fg-muted size-3.5 shrink-0" />
                <input
                  type="text"
                  value={subtaskTitle}
                  onChange={(e) => setSubtaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void handleAddSubtask()
                    }
                  }}
                  placeholder="Add subtask"
                  className="text-fg placeholder:text-fg-muted/40 min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </div>
            </div>
          </div>

          <div className="border-border flex shrink-0 items-center justify-between border-t px-5 py-3">
            <button
              type="button"
              onClick={() => void handleDelete()}
              className="text-danger border-danger/30 hover:bg-danger/10 focus-visible:ring-danger/35 flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <Trash2 className="size-3.5 shrink-0" />
              Delete
            </button>
            <div className="flex gap-2">
              <Dialog.Close asChild>
                <Button variant="ghost" size="sm">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
                {saving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                Save
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
