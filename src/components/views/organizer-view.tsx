'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bell, CalendarDays, CheckSquare, List, Loader2, Plus } from 'lucide-react'
import { TasksView } from '@/components/views/tasks-view'
import { CalendarView } from '@/components/views/calendar-view'
import { TaskRow } from '@/components/tasks/task-row'
import { TaskDetailDialog } from '@/components/tasks/task-detail-dialog'
import { useTasksStore } from '@/stores/tasks'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { buildTaskTree } from '@/lib/tasks'
import type { TaskItem } from '@/types/tasks'
import { cn } from '@/utils/cn'

export type OrganizerTab = 'tasks' | 'lists' | 'calendars' | 'reminders'

const TABS: { id: OrganizerTab; label: string; icon: typeof CheckSquare }[] = [
  { id: 'tasks',     label: 'Tasks',     icon: CheckSquare },
  { id: 'lists',     label: 'Lists',     icon: List },
  { id: 'calendars', label: 'Calendar',  icon: CalendarDays },
  { id: 'reminders', label: 'Reminders', icon: Bell },
]

// ─── Lists panel ────────────────────────────────────────────────────────────

function ListsPanel({ onOpenList }: { onOpenList: (list: string) => void }) {
  const { vaultFs } = useVaultSession()
  const items = useTasksStore((s) => s.items)
  const lists = useTasksStore((s) => s.lists)
  const loading = useTasksStore((s) => s.loading)
  const loadTasks = useTasksStore((s) => s.loadTasks)
  const createList = useTasksStore((s) => s.createList)
  const [newListName, setNewListName] = useState('')

  useEffect(() => { void loadTasks(vaultFs) }, [vaultFs, loadTasks])

  const listStats = useMemo(() =>
    lists.map((list) => {
      const pool = items.filter((i) => i.list === list)
      const active = pool.filter((i) => i.status !== 'done' && i.status !== 'cancelled').length
      const done   = pool.filter((i) => i.status === 'done').length
      return { list, active, done }
    }),
    [lists, items],
  )

  const handleAddList = async () => {
    if (!newListName.trim()) return
    await createList(vaultFs, newListName.trim())
    setNewListName('')
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="text-fg-muted size-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {listStats.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3">
            <List className="text-fg-muted/30 size-10" />
            <p className="text-fg-muted text-sm">No lists yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {listStats.map(({ list, active, done }) => (
              <button
                key={list}
                type="button"
                onClick={() => onOpenList(list)}
                className="border-border bg-bg hover:border-border-strong hover:bg-bg-hover rounded-xl border p-4 text-left transition-colors"
              >
                <p className="text-fg mb-1.5 truncate text-sm font-semibold">{list}</p>
                <p className="text-fg-muted text-xs">
                  {active} active{done > 0 ? ` · ${done} done` : ''}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="border-border border-t px-4 py-3">
        <div className="flex items-center gap-2">
          <Plus className="text-fg-muted size-4 shrink-0" />
          <input
            type="text"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); void handleAddList() }
            }}
            placeholder="New list…"
            className="text-fg placeholder:text-fg-muted/40 min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
      </div>
    </div>
  )
}

// ─── Reminders panel ─────────────────────────────────────────────────────────

function RemindersPanel() {
  const { vaultFs } = useVaultSession()
  const items = useTasksStore((s) => s.items)
  const loading = useTasksStore((s) => s.loading)
  const loadTasks = useTasksStore((s) => s.loadTasks)
  const [editTask, setEditTask] = useState<TaskItem | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => { void loadTasks(vaultFs) }, [vaultFs, loadTasks])

  const withDue = useMemo(() => {
    const pool = items
      .filter((i) => i.due && i.status !== 'done' && i.status !== 'cancelled')
      .slice()
      .sort((a, b) => {
        if (a.due && b.due) return a.due.localeCompare(b.due)
        return a.due ? -1 : 1
      })
    return buildTaskTree(pool)
  }, [items])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border bg-bg-secondary flex shrink-0 items-center border-b px-4 py-2.5">
        <h1 className="text-fg text-sm font-semibold">Reminders</h1>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="text-fg-muted size-6 animate-spin" />
          </div>
        ) : withDue.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <Bell className="text-fg-muted/30 size-10" />
            <p className="text-fg-muted text-sm">No upcoming reminders.</p>
          </div>
        ) : (
          <div className="flex flex-col py-1">
            {withDue.map((task) => (
              <TaskRow
                key={task.path}
                item={task}
                onEdit={(t) => { setEditTask(t); setDialogOpen(true) }}
              />
            ))}
          </div>
        )}
      </div>

      <TaskDetailDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editTask}
      />
    </div>
  )
}

// ─── OrganizerView ───────────────────────────────────────────────────────────

const LS_KEY = 'ink-organizer-tab'

export function OrganizerView({ initialTab }: { initialTab?: OrganizerTab }) {
  const [activeTab, setActiveTab] = useState<OrganizerTab>(() => {
    if (initialTab) return initialTab
    const saved = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null
    return (saved as OrganizerTab | null) ?? 'tasks'
  })

  const setActiveList   = useTasksStore((s) => s.setActiveList)
  const setActiveFilter = useTasksStore((s) => s.setActiveFilter)

  const switchTab = (tab: OrganizerTab) => {
    setActiveTab(tab)
    try { localStorage.setItem(LS_KEY, tab) } catch { /* noop */ }
  }

  const handleOpenList = (list: string) => {
    setActiveList(list)
    setActiveFilter('all')
    switchTab('tasks')
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Sub-tab bar */}
      <div className="border-border bg-bg-secondary flex shrink-0 items-center gap-0 border-b px-3">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => switchTab(id)}
            className={cn(
              'relative px-4 py-2.5 text-sm font-medium transition-colors',
              activeTab === id
                ? 'text-fg after:bg-accent after:absolute after:inset-x-0 after:bottom-0 after:h-[2px]'
                : 'text-fg-secondary hover:text-fg',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="min-h-0 flex-1">
        {activeTab === 'tasks'     && <TasksView />}
        {activeTab === 'lists'     && <ListsPanel onOpenList={handleOpenList} />}
        {activeTab === 'calendars' && <CalendarView />}
        {activeTab === 'reminders' && <RemindersPanel />}
      </div>
    </div>
  )
}
