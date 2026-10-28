import { create } from 'zustand'
import type { FileSystemAdapter } from '@/lib/fs/types'
import type { TaskItem, TaskPriority } from '@/types/tasks'
import { DEFAULT_TASK_INBOX } from '@/lib/tasks'
import {
  editTaskInText,
  formatTaskLine,
  insertSubtaskInText,
  newTaskFields,
  parseTasks,
  toggledLines,
  type TaskFields,
} from '@/lib/tasks/line'
import { getIndexTasks } from '@/lib/search/index'
import { reindexFilePath } from '@/lib/search/build-vault-index'
import { INDEX_CHANGED_EVENTS } from '@/lib/search/index-events'
import { announceNoteWritten } from '@/lib/notes/note-written'
import { useVaultStore } from '@/stores/vault'

/** What a new task can be given besides its text. */
export interface NewTask {
  due?: string
  time?: string
  priority?: TaskPriority
  repeatWeekday?: number
  /** The note to add it to; the inbox note when absent. */
  note?: string
}

interface TasksState {
  /** Every task in the vault's notes, in file order. */
  items: TaskItem[]
  loading: boolean
  /** Read at least once: `items` is the vault's, not the empty start. */
  loaded: boolean

  /** Read the tasks from the index. Called again whenever the index changes. */
  loadTasks: (fs?: FileSystemAdapter) => Promise<void>
  addTask: (fs: FileSystemAdapter, title: string, opts?: NewTask) => Promise<TaskItem | undefined>
  updateTask: (fs: FileSystemAdapter, task: TaskItem, patch: Partial<TaskFields>) => Promise<void>
  toggleTask: (fs: FileSystemAdapter, task: TaskItem) => Promise<void>
  /** Delete the task's line and the lines under it. */
  removeTask: (fs: FileSystemAdapter, task: TaskItem) => Promise<void>
  addSubtask: (fs: FileSystemAdapter, parent: TaskItem, title: string) => Promise<void>
  /** Write a note back as it was (Undo). */
  restoreNote: (fs: FileSystemAdapter, path: string, text: string) => Promise<void>
}

/** The note new tasks go to, from Settings. */
export function taskInbox(): string {
  const configured = useVaultStore.getState().config?.taskInbox?.trim()
  return (configured || DEFAULT_TASK_INBOX).replace(/^\/+/, '')
}

let generation = 0

export const useTasksStore = create<TasksState>()((set, get) => {
  /** Write a note and show its tasks at once; the index catches up behind. */
  async function writeNote(fs: FileSystemAdapter, path: string, text: string, created = false) {
    await fs.writeTextFile(path, text)
    generation++
    set((s) => ({
      items: [...s.items.filter((t) => t.path !== path), ...parseTasks(path, text)],
    }))
    announceNoteWritten(path)
    if (created) window.dispatchEvent(new CustomEvent('ink:vault-changed'))
    void reindexFilePath(fs, path).catch(() => {})
  }

  async function editLine(
    fs: FileSystemAdapter,
    task: TaskItem,
    edit: Parameters<typeof editTaskInText>[2],
  ) {
    const text = await fs.readTextFile(task.path)
    await writeNote(fs, task.path, editTaskInText(text, task, edit))
  }

  return {
    items: [],
    loading: false,
    loaded: false,

    loadTasks: async () => {
      const mine = ++generation
      set({ loading: get().items.length === 0 })
      try {
        const items = await getIndexTasks()
        // A write since the request started is newer than what the index had.
        if (mine === generation) set({ items, loaded: true })
      } finally {
        set({ loading: false })
      }
    },

    addTask: async (fs, title, opts = {}) => {
      const path = opts.note ?? taskInbox()
      const exists = await fs.exists(path)
      const before = exists ? await fs.readTextFile(path) : ''
      const line = formatTaskLine({
        ...newTaskFields(title),
        due: opts.due ?? null,
        time: opts.due ? (opts.time ?? null) : null,
        priority: opts.priority ?? 3,
        repeatWeekday: opts.repeatWeekday ?? null,
      })
      const eol = before.includes('\r\n') ? '\r\n' : '\n'
      const text =
        before && !before.endsWith('\n') ? `${before}${eol}${line}${eol}` : `${before}${line}${eol}`
      if (!exists) {
        const dir = path.split('/').slice(0, -1).join('/')
        if (dir && !(await fs.exists(dir))) await fs.mkdir(dir)
      }
      await writeNote(fs, path, text, !exists)
      return get()
        .items.filter((t) => t.path === path)
        .at(-1)
    },

    updateTask: (fs, task, patch) =>
      editLine(fs, task, (f, l) => [formatTaskLine({ ...f, ...patch }, l.indent, l.bullet)]),

    toggleTask: (fs, task) => editLine(fs, task, (f, l) => toggledLines(f, l)),

    removeTask: (fs, task) => editLine(fs, task, () => null),

    restoreNote: (fs, path, text) => writeNote(fs, path, text),

    addSubtask: async (fs, parent, title) => {
      const text = await fs.readTextFile(parent.path)
      await writeNote(fs, parent.path, insertSubtaskInText(text, parent, title))
    },
  }
})

// The index changed (a note saved, a sync, a reconcile): its tasks are current.
if (typeof window !== 'undefined') {
  let timer: ReturnType<typeof setTimeout> | undefined
  const reload = () => {
    clearTimeout(timer)
    timer = setTimeout(() => void useTasksStore.getState().loadTasks(), 150)
  }
  for (const name of INDEX_CHANGED_EVENTS) window.addEventListener(name, reload)
}
