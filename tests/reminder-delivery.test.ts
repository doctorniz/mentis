import { describe, it, expect, beforeAll, vi } from 'vitest'
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import matter from 'gray-matter'
import type { FileSystemAdapter } from '@/lib/fs/types'
import type { ReminderRow } from '@/core/index/protocol'
import { IndexStore } from '@/core/index/store'
import { readReminderRows, reminderId, settleReminder } from '@/lib/reminders/sources'
import { parseTasks } from '@/lib/tasks/line'
import { dueBetween } from '@/lib/reminders/scheduler'
import { requestOpen, takeOpen, pendingOpenKind } from '@/lib/reminders/open'

/** Just enough of a vault for the reminder sources: files held by path. */
function memoryFs(files: Record<string, string>): FileSystemAdapter {
  const isDir = (p: string) => Object.keys(files).some((f) => f.startsWith(`${p}/`))
  return {
    exists: async (p: string) => p in files || isDir(p),
    readTextFile: async (p: string) => {
      if (!(p in files)) throw new Error(`missing ${p}`)
      return files[p]!
    },
    writeTextFile: async (p: string, c: string) => {
      files[p] = c
    },
    readdir: async (dir: string) => {
      const names = new Set(
        Object.keys(files)
          .filter((f) => f.startsWith(`${dir}/`))
          .map((f) => f.slice(dir.length + 1).split('/')[0]!),
      )
      return [...names].map((name) => {
        const path = `${dir}/${name}`
        return { name, path, isDirectory: !(path in files) && isDir(path) } as never
      })
    },
  } as unknown as FileSystemAdapter
}

const task = (fm: string, title: string) => `---\n${fm}\n---\n\n# ${title}\n`

describe('readReminderRows', () => {
  it('reads task reminders from the tasks and event alerts from their folder, in order', async () => {
    const fs = memoryFs({
      '_mentis/_calendar/evt.md': task(
        'start: 2026-10-11T10:00\nend: 2026-10-11T11:00\nallDay: false\nalert: 15',
        'Standup',
      ),
    })
    const tasks = parseTasks(
      'Inbox.md',
      [
        '- [ ] Call mum >2026-10-12 09:00',
        '- [ ] Bins >2026-10-11 18:00',
        '- [x] Done already >2026-10-11 08:00 done:2026-10-10',
        '- [ ] No time >2026-10-11',
      ].join('\n'),
    )
    const rows = await readReminderRows(fs, new Date(2026, 9, 11), new Date(2026, 9, 13), tasks)
    expect(rows.map((r) => [r.kind, r.title, r.at])).toEqual([
      ['event', 'Standup', '2026-10-11T09:45'],
      ['task', 'Bins', '2026-10-11T18:00'],
      ['task', 'Call mum', '2026-10-12T09:00'],
    ])
  })

  it('has none when there are no tasks and no calendar folder yet', async () => {
    expect(
      await readReminderRows(memoryFs({}), new Date(2026, 9, 11), new Date(2026, 9, 13), []),
    ).toEqual([])
  })
})

describe('settleReminder', () => {
  it('writes Done and Snooze into an event file, keeping everything else', async () => {
    const path = '_mentis/_calendar/evt.md'
    const files = {
      [path]: task(
        'start: 2026-10-12T10:00\nend: 2026-10-12T11:00\nallDay: false\nalert: 15\ncustom: kept',
        'Standup',
      ),
    }
    const fs = memoryFs(files)
    await settleReminder(fs, path, {
      reminderAck: '2026-10-12T09:46',
      snoozeUntil: '2026-10-12T09:56',
    })
    const first = matter(files[path])
    expect(first.data).toMatchObject({
      custom: 'kept',
      reminderAck: '2026-10-12T09:46',
      snoozeUntil: '2026-10-12T09:56',
    })
    expect(first.content).toContain('# Standup')

    await settleReminder(fs, path, { reminderAck: '2026-10-12T09:57', snoozeUntil: '' })
    const { data } = matter(files[path])
    expect(data.reminderAck).toBe('2026-10-12T09:57')
    expect('snoozeUntil' in data).toBe(false)

    // Once done, the occurrence no longer reminds.
    const rows = await readReminderRows(fs, new Date(2026, 9, 11), new Date(2026, 9, 13), [])
    expect(rows).toEqual([])
  })
})

describe('dueBetween', () => {
  const row = (at: string): ReminderRow => ({
    kind: 'task',
    path: 'a.md',
    title: 'A',
    at,
    about: at,
  })
  it('takes the occurrences after the last look and up to now', () => {
    const rows = [row('2026-10-11T09:00'), row('2026-10-11T09:30'), row('2026-10-11T10:00')]
    const t = (hhmm: string) => new Date(`2026-10-11T${hhmm}:00`).getTime()
    expect(dueBetween(rows, t('09:00'), t('09:30')).map((r) => r.at)).toEqual(['2026-10-11T09:30'])
    expect(dueBetween(rows, t('08:00'), t('08:59'))).toEqual([])
    expect(reminderId(rows[0]!)).toBe('a.md@2026-10-11T09:00')
  })
})

describe('requestOpen', () => {
  it('waits until a view showing that kind has the item', () => {
    vi.stubGlobal('window', new EventTarget())
    requestOpen('event', 'evt.md')
    expect(pendingOpenKind()).toBe('event')
    expect(takeOpen('task', () => true)).toBeNull()
    expect(takeOpen('event', () => false)).toBeNull()
    expect(takeOpen('event', (p) => p === 'evt.md')).toBe('evt.md')
    expect(pendingOpenKind()).toBeNull()
  })
})

describe('IndexStore reminders', () => {
  let sqlite3: Awaited<ReturnType<typeof sqlite3InitModule>>
  beforeAll(async () => {
    sqlite3 = await sqlite3InitModule()
  })

  it('replaces the recorded occurrences whole and reads them by range', () => {
    const store = new IndexStore(new sqlite3.oo1.DB(':memory:'))
    const row = (at: string, path: string): ReminderRow => ({
      kind: 'task',
      path,
      title: 'T',
      at,
      about: '2026-10-12',
    })
    store.setReminders([row('2026-10-12T09:00', 'b.md'), row('2026-10-11T09:00', 'a.md')])
    expect(store.reminders('2026-10-11T00:00', '2026-10-12T09:00')).toEqual([
      row('2026-10-11T09:00', 'a.md'),
    ])
    store.setReminders([row('2026-10-11T10:00', 'c.md')])
    expect(store.reminders('2026-10-11T00:00', '2026-10-13T00:00')).toEqual([
      row('2026-10-11T10:00', 'c.md'),
    ])
  })
})

describe('IndexStore tasks', () => {
  let sqlite3: Awaited<ReturnType<typeof sqlite3InitModule>>
  beforeAll(async () => {
    sqlite3 = await sqlite3InitModule()
  })

  const doc = (path: string, text: string) => ({
    path,
    type: 'markdown',
    title: path,
    content: text,
    tags: [],
    size: text.length,
    mtime: 1,
    tasks: parseTasks(path, text),
  })

  it("keeps each note's tasks, replaced on reindex and dropped with the note", () => {
    const store = new IndexStore(new sqlite3.oo1.DB(':memory:'))
    store.upsert([doc('b.md', '- [ ] Two\n- [x] Three'), doc('a.md', '- [ ] One >2026-10-30')])
    expect(store.tasks().map((t) => [t.path, t.title, t.due])).toEqual([
      ['a.md', 'One', '2026-10-30'],
      ['b.md', 'Two', null],
      ['b.md', 'Three', null],
    ])

    store.upsert([doc('b.md', 'No tasks left')])
    expect(store.tasks().map((t) => t.title)).toEqual(['One'])

    store.remove(['a.md'])
    expect(store.tasks()).toEqual([])
  })

  it('lists the paths of one type', () => {
    const store = new IndexStore(new sqlite3.oo1.DB(':memory:'))
    store.upsert([
      { ...doc('b.md', ''), type: 'list' },
      { ...doc('a.list.md', ''), type: 'list' },
      doc('c.md', ''),
    ])
    expect(store.pathsOfType('list')).toEqual(['a.list.md', 'b.md'])
  })
})
