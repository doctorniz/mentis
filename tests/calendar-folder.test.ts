// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FileSystemAdapter } from '@/lib/fs/types'
import type { FileEntry } from '@/types/files'
import {
  calendarDir,
  eventFilename,
  hasEventFilename,
  isEventPath,
  parseCalendarEvent,
} from '@/lib/calendar'

vi.mock('@/lib/search/build-vault-index', () => ({ reindexFilePath: vi.fn(async () => {}) }))
vi.mock('@/lib/search/index', () => ({ removeSearchDocument: vi.fn() }))
vi.mock('@/lib/links/rename', () => ({ updateLinksAfterRename: vi.fn(async () => 0) }))

const { useCalendarStore } = await import('@/stores/calendar')
const { updateLinksAfterRename } = await import('@/lib/links/rename')

/** Files by vault path; just what the calendar store touches. */
function memVault() {
  const files = new Map<string, string>()
  const folders = new Set<string>()
  const fs = {
    exists: async (p: string) =>
      files.has(p) || folders.has(p) || [...files.keys()].some((f) => f.startsWith(`${p}/`)),
    mkdir: async (p: string) => void folders.add(p),
    readdir: async (dir: string) =>
      [...files.keys()]
        .filter((p) => p.startsWith(`${dir}/`))
        .map((p) => ({ path: p, name: p.slice(dir.length + 1), isDirectory: false }) as FileEntry),
    readTextFile: async (p: string) => files.get(p)!,
    writeTextFile: async (p: string, c: string) => void files.set(p, c),
    remove: async (p: string) => void files.delete(p),
  } as unknown as FileSystemAdapter
  return { fs, files }
}

const opts = (title: string, start: string) => ({
  title,
  start,
  end: start,
  allDay: true,
  color: 'violet' as const,
})

describe('eventFilename', () => {
  it('names an event by its day and title', () => {
    expect(eventFilename('Dentist', '2026-11-03T09:30')).toBe('2026-11-03 Dentist.md')
  })

  it('drops characters a file name or a wiki-link cannot hold', () => {
    expect(eventFilename('Q4: plan [draft] #work / review.', '2026-11-03')).toBe(
      '2026-11-03 Q4 plan draft work review.md',
    )
  })

  it('names an untitled event by its day', () => {
    expect(eventFilename('  ', '2026-11-03')).toBe('2026-11-03.md')
  })
})

describe('hasEventFilename', () => {
  it('accepts the name and its numbered twins only', () => {
    expect(hasEventFilename('Calendar/2026-11-03 Dentist.md', 'Dentist', '2026-11-03')).toBe(true)
    expect(hasEventFilename('Calendar/2026-11-03 Dentist 2.md', 'Dentist', '2026-11-03')).toBe(
      true,
    )
    expect(hasEventFilename('Calendar/2026-11-03 Dentist.md', 'Dentist', '2026-11-04')).toBe(false)
    expect(hasEventFilename('Calendar/2026-11-03 Dentist x.md', 'Dentist', '2026-11-03')).toBe(
      false,
    )
  })
})

describe('calendarDir and isEventPath', () => {
  it('defaults to Calendar and trims slashes', () => {
    expect(calendarDir(null)).toBe('Calendar')
    expect(calendarDir({ calendarFolder: '/Life/Calendar/' })).toBe('Life/Calendar')
  })

  it('counts only notes directly in the folder', () => {
    expect(isEventPath('Calendar/2026-11-03 Dentist.md', 'Calendar')).toBe(true)
    expect(isEventPath('Calendar/old/a.md', 'Calendar')).toBe(false)
    expect(isEventPath('Calendar/photo.png', 'Calendar')).toBe(false)
    expect(isEventPath('Calendars/a.md', 'Calendar')).toBe(false)
  })
})

describe('parseCalendarEvent', () => {
  it('reads dates typed by hand without quotes', () => {
    const ev = parseCalendarEvent(
      'Calendar/a.md',
      '---\nstart: 2026-11-03\nend: 2026-11-04 09:30:00\ncreated: 2026-11-01\n---\n\n# Trip\n',
    )
    expect([ev.start, ev.end, ev.created]).toEqual([
      '2026-11-03',
      '2026-11-04T09:30',
      '2026-11-01T00:00:00.000Z',
    ])
  })
})

describe('calendar store', () => {
  beforeEach(() => {
    useCalendarStore.setState({ events: [] })
    vi.mocked(updateLinksAfterRename).mockClear()
  })

  it('writes a new event to Calendar/, named by day and title', async () => {
    const { fs, files } = memVault()
    await useCalendarStore.getState().addEvent(fs, opts('Dentist', '2026-11-03'))
    await useCalendarStore.getState().addEvent(fs, opts('Dentist', '2026-11-03'))
    expect([...files.keys()]).toEqual([
      'Calendar/2026-11-03 Dentist.md',
      'Calendar/2026-11-03 Dentist 2.md',
    ])
    expect(files.get('Calendar/2026-11-03 Dentist.md')).toContain('# Dentist')
  })

  it('renames the file when the title or day changes, and the links follow', async () => {
    const { fs, files } = memVault()
    const ev = await useCalendarStore.getState().addEvent(fs, opts('Dentist', '2026-11-03'))
    await useCalendarStore.getState().updateEvent(fs, ev.path, opts('Dentist', '2026-11-03'))
    expect(updateLinksAfterRename).not.toHaveBeenCalled()

    await useCalendarStore.getState().updateEvent(fs, ev.path, opts('Orthodontist', '2026-11-05'))
    expect([...files.keys()]).toEqual(['Calendar/2026-11-05 Orthodontist.md'])
    expect(updateLinksAfterRename).toHaveBeenCalledWith(
      fs,
      'Calendar/2026-11-03 Dentist.md',
      'Calendar/2026-11-05 Orthodontist.md',
    )
    const [moved] = useCalendarStore.getState().events
    expect(moved!.path).toBe('Calendar/2026-11-05 Orthodontist.md')
    expect(moved!.uid).toBe(ev.uid)
  })

  it('reads only the notes directly in the folder', async () => {
    const { fs, files } = memVault()
    files.set('Calendar/2026-11-03 Dentist.md', '---\nstart: 2026-11-03\n---\n\n# Dentist\n')
    files.set('Calendar/photo.png', '')
    await useCalendarStore.getState().loadEvents(fs)
    expect(useCalendarStore.getState().events.map((e) => e.title)).toEqual(['Dentist'])
  })
})
