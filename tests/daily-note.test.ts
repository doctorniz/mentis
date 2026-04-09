import { describe, it, expect, beforeEach } from 'vitest'
import type { FileSystemAdapter } from '@/lib/fs/types'
import type { FileEntry, FileStats } from '@/types/files'
import { FileType } from '@/types/files'
import {
  todayDailyNotePath,
  dailyNoteTitle,
  openOrCreateDailyNote,
} from '@/lib/notes/daily-note'

class InMemoryAdapter implements FileSystemAdapter {
  readonly type = 'opfs' as const
  private files = new Map<string, Uint8Array>()
  private dirs = new Set<string>([''])

  async init() {}

  async readFile(path: string): Promise<Uint8Array> {
    const data = this.files.get(path)
    if (!data) throw new Error(`File not found: ${path}`)
    return data
  }

  async readTextFile(path: string): Promise<string> {
    return new TextDecoder().decode(await this.readFile(path))
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    this.files.set(path, data)
  }

  async writeTextFile(path: string, content: string): Promise<void> {
    await this.writeFile(path, new TextEncoder().encode(content))
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.dirs.has(path)
  }

  async stat(path: string): Promise<FileStats> {
    if (!this.files.has(path)) throw new Error(`Not found: ${path}`)
    const now = new Date()
    return { size: this.files.get(path)!.length, createdAt: now, modifiedAt: now }
  }

  async mkdir(path: string): Promise<void> {
    this.dirs.add(path)
  }

  async readdir(path: string): Promise<FileEntry[]> {
    const prefix = path ? path + '/' : ''
    const entries: FileEntry[] = []
    for (const fp of this.files.keys()) {
      if (!fp.startsWith(prefix)) continue
      const rest = fp.slice(prefix.length)
      if (!rest.includes('/')) {
        entries.push({ name: rest, path: fp, isDirectory: false, type: FileType.Markdown })
      }
    }
    return entries
  }

  async rename(): Promise<void> {}
  async remove(): Promise<void> {}
}

describe('todayDailyNotePath', () => {
  it('formats today as daily/YYYY-MM-DD.md', () => {
    const date = new Date(2026, 2, 31)
    expect(todayDailyNotePath(date)).toBe('daily/2026-03-31.md')
  })

  it('zero-pads single-digit month and day', () => {
    const date = new Date(2026, 0, 5)
    expect(todayDailyNotePath(date)).toBe('daily/2026-01-05.md')
  })
})

describe('dailyNoteTitle', () => {
  it('returns a human-readable date string', () => {
    const date = new Date(2026, 2, 31)
    const title = dailyNoteTitle(date)
    expect(title).toContain('2026')
    expect(title).toContain('March')
    expect(title).toContain('31')
    expect(title).toContain('Tuesday')
  })
})

describe('openOrCreateDailyNote', () => {
  let fs: InMemoryAdapter

  beforeEach(() => {
    fs = new InMemoryAdapter()
  })

  it('creates the note if it does not exist', async () => {
    const date = new Date(2026, 2, 31)
    const path = await openOrCreateDailyNote(fs, date)
    expect(path).toBe('daily/2026-03-31.md')
    expect(await fs.exists(path)).toBe(true)

    const content = await fs.readTextFile(path)
    expect(content).toContain('title:')
    expect(content).toContain('tags: [daily]')
    expect(content).toContain('# ')
  })

  it('returns the existing note path without overwriting', async () => {
    const date = new Date(2026, 2, 31)
    const path = 'daily/2026-03-31.md'
    await fs.mkdir('daily')
    await fs.writeTextFile(path, '# My existing content')

    const result = await openOrCreateDailyNote(fs, date)
    expect(result).toBe(path)

    const content = await fs.readTextFile(path)
    expect(content).toBe('# My existing content')
  })

  it('creates daily/ directory if missing', async () => {
    const date = new Date(2026, 5, 15)
    await openOrCreateDailyNote(fs, date)
    expect(await fs.exists('daily')).toBe(true)
  })

  it('works for different dates', async () => {
    const d1 = new Date(2026, 0, 1)
    const d2 = new Date(2026, 11, 25)
    const p1 = await openOrCreateDailyNote(fs, d1)
    const p2 = await openOrCreateDailyNote(fs, d2)
    expect(p1).toBe('daily/2026-01-01.md')
    expect(p2).toBe('daily/2026-12-25.md')
    expect(await fs.exists(p1)).toBe(true)
    expect(await fs.exists(p2)).toBe(true)
  })
})
