import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { FileSystemAdapter } from '@/lib/fs/types'
import type { CalendarEvent, CalendarEventColor } from '@/types/calendar'
import {
  calendarDir,
  parseCalendarEvent,
  serializeCalendarEvent,
  eventFilename,
  hasEventFilename,
  defaultEventFrontmatter,
} from '@/lib/calendar'
import { uniqueVaultPath } from '@/lib/fs/unique-path'
import { reindexFilePath } from '@/lib/search/build-vault-index'
import { removeSearchDocument } from '@/lib/search/index'
import { updateLinksAfterRename } from '@/lib/links/rename'
import { useVaultStore } from '@/stores/vault'

interface EventOpts {
  title: string
  start: string
  end: string
  allDay: boolean
  color: CalendarEventColor
  location?: string
  url?: string
  body?: string
  tz?: string
  repeat?: CalendarEvent['repeat']
  alert?: number
}

interface CalendarState {
  events: CalendarEvent[]
  loading: boolean

  loadEvents: (fs: FileSystemAdapter) => Promise<void>
  addEvent: (fs: FileSystemAdapter, opts: EventOpts) => Promise<CalendarEvent>
  updateEvent: (fs: FileSystemAdapter, path: string, opts: EventOpts) => Promise<void>
  removeEvent: (fs: FileSystemAdapter, path: string) => Promise<void>
}

const currentDir = () => calendarDir(useVaultStore.getState().config)

/** A new event's path in the Calendar folder, made if missing (the tree then shows it). */
async function newEventPath(fs: FileSystemAdapter, title: string, start: string): Promise<string> {
  const dir = currentDir()
  if (!(await fs.exists(dir))) {
    await fs.mkdir(dir)
    window.dispatchEvent(new CustomEvent('ink:vault-changed'))
  }
  return uniqueVaultPath(fs, `${dir}/${eventFilename(title, start)}`)
}

export const useCalendarStore = create<CalendarState>()(
  immer((set, get) => ({
    events: [],
    loading: false,

    loadEvents: async (fs) => {
      set((s) => {
        s.loading = true
      })
      try {
        const dir = currentDir()
        const exists = await fs.exists(dir)
        if (!exists) {
          set((s) => {
            s.events = []
            s.loading = false
          })
          return
        }
        const paths = (await fs.readdir(dir))
          .filter((e) => !e.isDirectory && e.name.toLowerCase().endsWith('.md'))
          .map((e) => e.path)
        const events: CalendarEvent[] = []
        for (const p of paths) {
          try {
            const raw = await fs.readTextFile(p)
            events.push(parseCalendarEvent(p, raw))
          } catch {
            /* skip unreadable */
          }
        }
        set((s) => {
          s.events = events
          s.loading = false
        })
      } catch {
        set((s) => {
          s.loading = false
        })
      }
    },

    addEvent: async (fs, opts) => {
      const fm = defaultEventFrontmatter({
        start: opts.start,
        end: opts.end,
        allDay: opts.allDay,
        color: opts.color,
        ...(opts.location ? { location: opts.location } : {}),
        ...(opts.url ? { url: opts.url } : {}),
        ...(opts.tz ? { tz: opts.tz } : {}),
        ...(opts.repeat ? { repeat: opts.repeat } : {}),
        ...(opts.alert != null ? { alert: opts.alert } : {}),
      })

      const path = await newEventPath(fs, opts.title, opts.start)
      const raw = serializeCalendarEvent(fm, opts.title, opts.body ?? '')
      await fs.writeTextFile(path, raw)
      void reindexFilePath(fs, path)

      const ev = parseCalendarEvent(path, raw)
      set((s) => {
        s.events.push(ev)
      })
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
        ...(opts.location ? { location: opts.location } : {}),
        ...(opts.url ? { url: opts.url } : {}),
        // Fields the event editor does not show yet are kept as they were.
        ...((opts.tz ?? existing.tz) ? { tz: opts.tz ?? existing.tz } : {}),
        ...((opts.repeat ?? existing.repeat) ? { repeat: opts.repeat ?? existing.repeat } : {}),
        ...((opts.alert ?? existing.alert) != null ? { alert: opts.alert ?? existing.alert } : {}),
        // Done / Snooze state belongs to the alerts; an edit keeps it.
        ...(existing.reminderAck ? { reminderAck: existing.reminderAck } : {}),
        ...(existing.snoozeUntil ? { snoozeUntil: existing.snoozeUntil } : {}),
        created: existing.created,
      })

      // A new title or day renames the file, and the links to it follow.
      const raw = serializeCalendarEvent(fm, opts.title, opts.body ?? '')
      const renamed = !hasEventFilename(path, opts.title, opts.start)
      const nextPath = renamed ? await newEventPath(fs, opts.title, opts.start) : path
      await fs.writeTextFile(nextPath, raw)
      if (renamed) {
        await fs.remove(path)
        removeSearchDocument(path)
      }
      void reindexFilePath(fs, nextPath)
      if (renamed) void updateLinksAfterRename(fs, path, nextPath)

      const updated = parseCalendarEvent(nextPath, raw)
      set((s) => {
        const idx = s.events.findIndex((e) => e.path === path)
        if (idx !== -1) s.events[idx] = updated
      })
    },

    removeEvent: async (fs, path) => {
      try {
        await fs.remove(path)
      } catch {
        /* already gone */
      }
      removeSearchDocument(path)
      set((s) => {
        s.events = s.events.filter((e) => e.path !== path)
      })
    },
  })),
)
