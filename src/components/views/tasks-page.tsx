import { useEffect } from 'react'
import { TasksView } from '@/components/views/tasks-view'
import { ListsPanel } from '@/components/lists/lists-panel'
import { ViewTabs, useRememberedTab } from '@/components/views/view-tabs'
import { OPEN_REMINDER_EVENT, pendingOpenKind } from '@/lib/reminders/open'

type Tab = 'tasks' | 'lists'

const TABS = [
  { id: 'tasks', label: 'All tasks' },
  { id: 'lists', label: 'Lists' },
] as const

export function TasksPage() {
  const [tab, setTab] = useRememberedTab<Tab>('ink-tasks-tab', ['tasks', 'lists'], 'tasks')

  // A task reminder's Open: show the task list, which then opens the task.
  useEffect(() => {
    function openRequested() {
      if (pendingOpenKind() === 'task') setTab('tasks')
    }
    openRequested()
    window.addEventListener(OPEN_REMINDER_EVENT, openRequested)
    return () => window.removeEventListener(OPEN_REMINDER_EVENT, openRequested)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewTabs tabs={TABS} active={tab} onChange={setTab} />
      <div className="min-h-0 flex-1">
        {tab === 'tasks' && <TasksView />}
        {tab === 'lists' && <ListsPanel />}
      </div>
    </div>
  )
}
