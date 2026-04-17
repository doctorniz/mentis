import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { FileSystemAdapter } from '@/lib/fs/types'
import type { TaskItem, TaskFrontmatter, TaskPriority } from '@/types/tasks'
import {
  TASKS_DIR,
  parseTaskItem,
  serializeTask,
  generateTaskFilename,
  defaultTaskFrontmatter,
  bodyFromTitle,
  mergeTaskFrontmatterForSave,
} from '@/lib/tasks'
import { nextWeeklyDueAfterCompletion } from '@/lib/tasks/recurrence'

export type TaskFilter = 'all' | 'today' | 'upcoming'

interface TasksState {
  items: TaskItem[]
  lists: string[]
  activeList: string | null
  activeFilter: TaskFilter
  loading: boolean

  loadTasks: (fs: FileSystemAdapter) => Promise<void>
  addTask: (
    fs: FileSystemAdapter,
    title: string,
    opts?: {
      list?: string | null
      priority?: TaskPriority
      due?: string
      tags?: string[]
      parent?: string
      repeat?: 'weekly'
      repeatWeekday?: number
    },
  ) => Promise<TaskItem>
  updateTask: (
    fs: FileSystemAdapter,
    path: string,
    fields: Partial<TaskFrontmatter & { body: string }>,
  ) => Promise<void>
  toggleTask: (fs: FileSystemAdapter, path: string) => Promise<void>
  removeTask: (fs: FileSystemAdapter, path: string) => Promise<void>
  clearCompleted: (fs: FileSystemAdapter, list?: string | null) => Promise<void>
  moveToList: (
    fs: FileSystemAdapter,
    path: string,
    newList: string | null,
  ) => Promise<void>
  reorderTask: (fs: FileSystemAdapter, path: string, newOrder: number) => Promise<void>
  createList: (fs: FileSystemAdapter, name: string) => Promise<void>
  removeList: (fs: FileSystemAdapter, name: string) => Promise<void>
  setActiveList: (list: string | null) => void
  setActiveFilter: (filter: TaskFilter) => void
}

async function collectTaskFiles(
  fs: FileSystemAdapter,
  dir: string,
  acc: string[],
): Promise<void> {
  const entries = await fs.readdir(dir)
  for (const e of entries) {
    if (e.isDirectory) {
      await collectTaskFiles(fs, e.path, acc)
    } else if (e.name.endsWith('.md')) {
      acc.push(e.path)
    }
  }
}

async function collectLists(fs: FileSystemAdapter): Promise<string[]> {
  const entries = await fs.readdir(TASKS_DIR)
  return entries.filter((e) => e.isDirectory).map((e) => e.name)
}

export const useTasksStore = create<TasksState>()(
  immer((set, get) => ({
    items: [],
    lists: [],
    activeList: null,
    activeFilter: 'all' as TaskFilter,
    loading: false,

    loadTasks: async (fs) => {
      set((s) => { s.loading = true })
      try {
        const exists = await fs.exists(TASKS_DIR)
        if (!exists) {
          await fs.mkdir(TASKS_DIR)
          set((s) => { s.items = []; s.lists = []; s.loading = false })
          return
        }

        const paths: string[] = []
        await collectTaskFiles(fs, TASKS_DIR, paths)

        const items: TaskItem[] = []
        for (const p of paths) {
          try {
            const raw = await fs.readTextFile(p)
            items.push(parseTaskItem(p, raw))
          } catch { /* skip unreadable */ }
        }

        const lists = await collectLists(fs)
        set((s) => { s.items = items; s.lists = lists; s.loading = false })
      } catch {
        set((s) => { s.loading = false })
      }
    },

    addTask: async (fs, title, opts) => {
      const exists = await fs.exists(TASKS_DIR)
      if (!exists) await fs.mkdir(TASKS_DIR)

      const list = opts?.list ?? get().activeList
      const dir = list ? `${TASKS_DIR}/${list}` : TASKS_DIR
      if (list) {
        const catExists = await fs.exists(dir)
        if (!catExists) await fs.mkdir(dir)
      }

      const fm = defaultTaskFrontmatter({
        priority: opts?.priority,
        due: opts?.due ?? '',
        tags: opts?.tags ?? [],
        parent: opts?.parent ?? '',
        ...(opts?.repeat === 'weekly' && opts.repeatWeekday != null
          ? { repeat: 'weekly' as const, repeatWeekday: opts.repeatWeekday }
          : {}),
      })

      const filename = generateTaskFilename()
      const path = `${dir}/${filename}`
      const body = bodyFromTitle(title)
      const raw = serializeTask(fm, body)
      await fs.writeTextFile(path, raw)

      const item = parseTaskItem(path, raw)
      set((s) => {
        s.items.push(item)
        if (list && !s.lists.includes(list)) {
          s.lists.push(list)
          s.lists.sort()
        }
      })
      return item
    },

    updateTask: async (fs, path, fields) => {
      const state = get()
      const existing = state.items.find((i) => i.path === path)
      if (!existing) return

      const { body: bodyField, ...fmPatch } = fields as Partial<TaskFrontmatter> & {
        body?: string
      }
      const fm = mergeTaskFrontmatterForSave(existing, fmPatch)
      const body = bodyField ?? existing.body
      const raw = serializeTask(fm, body)
      await fs.writeTextFile(path, raw)

      const updated = parseTaskItem(path, raw)
      set((s) => {
        const idx = s.items.findIndex((i) => i.path === path)
        if (idx !== -1) s.items[idx] = updated
      })
    },

    toggleTask: async (fs, path) => {
      const state = get()
      const existing = state.items.find((i) => i.path === path)
      if (!existing) return

      const isDone = existing.status === 'done'
      const now = new Date().toISOString()

      const rollWeekly =
        !isDone &&
        existing.repeat === 'weekly' &&
        existing.repeatWeekday != null

      const newStatus = rollWeekly ? 'todo' : isDone ? 'todo' : 'done'
      const nextDue =
        rollWeekly && existing.repeatWeekday != null
          ? nextWeeklyDueAfterCompletion(new Date(), existing.repeatWeekday)
          : (existing.due ?? '')
      const nextCompleted = rollWeekly ? '' : isDone ? '' : now

      const fm: TaskFrontmatter = {
        uid: existing.uid,
        status: newStatus,
        priority: existing.priority,
        due: nextDue,
        created: existing.created,
        modified: now,
        completed: nextCompleted,
        tags: existing.tags,
        parent: existing.parent ?? '',
        order: existing.order,
      }

      if (existing.repeat === 'weekly' && existing.repeatWeekday != null) {
        fm.repeat = 'weekly'
        fm.repeatWeekday = existing.repeatWeekday
      }

      const raw = serializeTask(fm, existing.body)
      await fs.writeTextFile(path, raw)

      const updated = parseTaskItem(path, raw)
      set((s) => {
        const idx = s.items.findIndex((i) => i.path === path)
        if (idx !== -1) s.items[idx] = updated
      })
    },

    removeTask: async (fs, path) => {
      const state = get()
      const target = state.items.find((i) => i.path === path)
      if (!target) return

      const childPaths = state.items
        .filter((i) => i.parent === target.uid)
        .map((i) => i.path)

      for (const cp of childPaths) {
        try { await fs.remove(cp) } catch { /* already gone */ }
      }
      try { await fs.remove(path) } catch { /* already gone */ }

      set((s) => {
        const uid = target.uid
        s.items = s.items.filter((i) => i.path !== path && i.parent !== uid)
      })
    },

    clearCompleted: async (fs, list) => {
      const state = get()
      const toRemove = state.items.filter(
        (i) =>
          i.status === 'done' &&
          (list === undefined ? true : i.list === list),
      )

      for (const item of toRemove) {
        try { await fs.remove(item.path) } catch { /* ignore */ }
      }

      const removePaths = new Set(toRemove.map((i) => i.path))
      set((s) => {
        s.items = s.items.filter((i) => !removePaths.has(i.path))
      })
    },

    moveToList: async (fs, path, newList) => {
      const state = get()
      const target = state.items.find((i) => i.path === path)
      if (!target) return

      const dir = newList ? `${TASKS_DIR}/${newList}` : TASKS_DIR
      if (newList) {
        const catExists = await fs.exists(dir)
        if (!catExists) await fs.mkdir(dir)
      }

      const filename = path.split('/').pop()!
      const newPath = `${dir}/${filename}`
      if (newPath === path) return

      await fs.rename(path, newPath)

      const children = state.items.filter((i) => i.parent === target.uid)
      for (const child of children) {
        const childFilename = child.path.split('/').pop()!
        const childNewPath = `${dir}/${childFilename}`
        if (childNewPath !== child.path) {
          await fs.rename(child.path, childNewPath)
        }
      }

      set((s) => {
        const item = s.items.find((i) => i.path === path)
        if (item) {
          item.path = newPath
          item.list = newList
        }
        for (const child of s.items) {
          if (child.parent === target.uid) {
            const cf = child.path.split('/').pop()!
            child.path = `${dir}/${cf}`
            child.list = newList
          }
        }
        if (newList && !s.lists.includes(newList)) {
          s.lists.push(newList)
          s.lists.sort()
        }
      })
    },

    reorderTask: async (fs, path, newOrder) => {
      const store = get()
      const existing = store.items.find((i) => i.path === path)
      if (!existing) return

      await store.updateTask(fs, path, { order: newOrder })
    },

    createList: async (fs, name) => {
      const dir = `${TASKS_DIR}/${name}`
      const exists = await fs.exists(TASKS_DIR)
      if (!exists) await fs.mkdir(TASKS_DIR)
      await fs.mkdir(dir)
      set((s) => {
        if (!s.lists.includes(name)) {
          s.lists.push(name)
          s.lists.sort()
        }
      })
    },

    removeList: async (fs, name) => {
      const dir = `${TASKS_DIR}/${name}`
      try { await fs.removeDir(dir) } catch { /* ignore */ }
      set((s) => {
        s.lists = s.lists.filter((l) => l !== name)
        s.items = s.items.filter((i) => i.list !== name)
        if (s.activeList === name) s.activeList = null
      })
    },

    setActiveList: (list) =>
      set((s) => { s.activeList = list }),

    setActiveFilter: (filter) =>
      set((s) => { s.activeFilter = filter }),
  })),
)
