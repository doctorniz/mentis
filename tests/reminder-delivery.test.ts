import { describe, it, expect, beforeAll, vi } from 'vitest'
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import matter from 'gray-matter'
import type { FileSystemAdapter } from '@/lib/fs/types'
import type { ReminderRow } from '@/core/index/protocol'
import { IndexStore } from '@/core/index/store'
import { readReminderRows, reminderId, settleReminder } from '@/lib/reminders/sources'
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
  it('reads task reminders and event alerts from their folders, in order', async () => {
    const fs = memoryFs({
      '_mentis/_tasks/a.md': task('status: todo\nremind: 2026-10-12T09:00', 'Call mum'),
      '_mentis/_tasks/Home/b.md': task('status: todo\nremind: 2026-10-11T18:00', 'Bins'),
      '_mentis/_tasks/c.md': task('status: done\nremind: 2026-10-11T08:00', 'Done already'),
      '_mentis/_calendar/evt.md': task(
        'start: 2026-10-11T10:00\nend: 2026-10-11T11:00\nallDay: false\nalert: 15',
        'Standup',
      ),
      '_mentis/_tasks/broken.md': 'not front matter at all',
    })
    const rows = await readReminderRows(fs, new Date(2026, 9, 11), new Date(2026, 9, 13))
    expect(rows.map((r) => [r.kind, r.title, r.at])).toEqual([
      ['event', 'Standup', '2026-10-11T09:45'],
      ['task', 'Bins', '2026-10-11T18:00'],
      ['task', 'Call mum', '2026-10-12T09:00'],
    ])
  })

  it('has none when the folders do not exist yet', async () => {
    expect(
      await readReminderRows(memoryFs({}), new Date(2026, 9, 11), new Date(2026, 9, 13)),
    ).toEqual([])
  })
})

describe('settleReminder', () => {
  it('writes Done and Snooze into the file, keeping everything else', async () => {
    const files = {
      '_mentis/_tasks/a.md': task(
        'uid: x1\nstatus: todo\nremind: 2026-10-12T09:00\ncustom: kept',
        'Call mum',
      ),
    }
    const fs = memoryFs(files)
    await settleReminder(fs, '_mentis/_tasks/a.md', {
      reminderAck: '2026-10-12T09:01',
      snoozeUntil: '2026-10-12T09:11',
    })
    const first = matter(files['_mentis/_tasks/a.md'])
    expect(first.data).toMatchObject({
      uid: 'x1',
      custom: 'kept',
      remind: '2026-10-12T09:00',
      reminderAck: '2026-10-12T09:01',
      snoozeUntil: '2026-10-12T09:11',
    })
    expect(first.content).toContain('# Call mum')

    await settleReminder(fs, '_mentis/_tasks/a.md', {
      reminderAck: '2026-10-12T09:12',
      snoozeUntil: '',
    })
    const { data } = matter(files['_mentis/_tasks/a.md'])
    expect(data.reminderAck).toBe('2026-10-12T09:12')
    expect('snoozeUntil' in data).toBe(false)

    // Once done, the occurrence no longer reminds.
    const rows = await readReminderRows(fs, new Date(2026, 9, 11), new Date(2026, 9, 13))
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
