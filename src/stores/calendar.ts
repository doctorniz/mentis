import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { FileSystemAdapter } from '@/lib/fs/types'
import type { CalendarEvent, CalendarEventColor } from '@/types/calendar'
import {
  CALENDAR_DIR,
  parseCalendarEvent,
  serializeCalendarEvent,
  generateEventFilename,
  defaultEventFrontmatter,
} from '@/lib/calendar'

interface CalendarState {
  events: CalendarEvent[]
  loading: boolean

  loadEvents: (fs: FileSystemAdapter) => Promise<void>
  addEvent: (
    fs: FileSystemAdapter,
    opts: {
      title: string
      start: string
      end: string
      allDay: boolean
      color: CalendarEventColor
      body?: string
    },
  ) => Promise<CalendarEvent>
  updateEvent: (
    fs: FileSystemAdapter,
    path: string,
    opts: {
      title: string
      start: string
      end: string
      allDay: boolean
      color: CalendarEventColor
      body?: string
    },
  ) => Promise<void>
  removeEvent: (fs: FileSystemAdapter, path: string) => Promise<void>
}

async function collectEventFiles(
  fs: FileSystemAdapter,
  dir: string,
  acc: string[],
): Promise<void> {
  const entries = await fs.readdir(dir)
  for (const e of entries) {
    if (e.isDirectory) {
      await collectEventFiles(fs, e.path, acc)
    } else if (e.name.endsWith('.md')) {
      acc.push(e.path)
    }
  }
}

export const useCalendarStore = create<CalendarState>()(
  immer((set, get) => ({
    events: [],
    loading: false,

    loadEvents: async (fs) => {
      set((s) => { s.loading = true })
      try {
        const exists = await fs.exists(CALENDAR_DIR)
        if (!exists) {
          set((s) => { s.events = []; s.loading = false })
          return
        }
        const paths: string[] = []
        await collectEventFiles(fs, CALENDAR_DIR, paths)
        const events: CalendarEvent[] = []
        for (const p of paths) {
          try {
            const raw = await fs.readTextFile(p)
            events.push(parseCalendarEvent(p, raw))
          } catch { /* skip unreadable */ }
        }
        set((s) => { s.events = events; s.loading = false })
      } catch {
        set((s) => { s.loading = false })
      }
    },

    addEvent: async (fs, opts) => {
      const exists = await fs.exists(CALENDAR_DIR)
      if (!exists) await fs.mkdir(CALENDAR_DIR)

      const fm = defaultEventFrontmatter({
        start: opts.start,
        end: opts.end,
        allDay: opts.allDay,
        color: opts.color,
      })

      const filename = generateEventFilename()
      const path = `${CALENDAR_DIR}/${filename}`
      const raw = serializeCalendarEvent(fm, opts.title, opts.body ?? '')
      await fs.writeTextFile(path, raw)

      const ev = parseCalendarEvent(path, raw)
      set((s) => { s.events.push(ev) })
      return ev
    },

    updateEvent: async (fs, path, opts) => {
      const existing = get().events.find((e) => e.path === path)
      if (!existing) return

      const fm = defaultEventFrontmatter({
        uid: existing.uid,
        start: opts.start,
        end: opts.end,
        allDay: opts.allDay,
        color: opts.color,
        created: existing.created,
      })

      const raw = serializeCalendarEvent(fm, opts.title, opts.body ?? '')
      await fs.writeTextFile(path, raw)

      const updated = parseCalendarEvent(path, raw)
      set((s) => {
        const idx = s.events.findIndex((e) => e.path === path)
        if (idx !== -1) s.events[idx] = updated
      })
    },

    removeEvent: async (fs, path) => {
      try { await fs.remove(path) } catch { /* already gone */ }
      set((s) => { s.events = s.events.filter((e) => e.path !== path) })
    },
  })),
)
