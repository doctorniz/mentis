import { describe, expect, it } from 'vitest'
import {
  editTaskInText,
  formatTaskLine,
  insertSubtaskInText,
  nestTasks,
  parseTasks,
  parseTaskText,
  TaskNotFoundError,
  toggledLines,
  withDoneToken,
} from '@/lib/tasks/line'
import { markdownToTiptapJSON, tiptapJSONToMarkdown } from '@/lib/editor/markdown-bridge'

const NOTE = [
  '---',
  'title: Week',
  '- [ ] not a task: frontmatter',
  '---',
  '# Week',
  '',
  '- [ ] Call the bank >2026-10-30 09:00 !2 #money',
  '  - [x] Find the letter done:2026-10-27',
  '- [ ] Gym >2026-10-28 every monday',
  '',
  '```',
  '- [ ] not a task: code',
  '```',
  '* [X] Book flights',
].join('\n')

describe('parseTaskText', () => {
  it('reads the tokens and leaves the text and its tags', () => {
    const f = parseTaskText(
      'Call the bank >2026-10-30 9:05 !2 #money snooze:2026-10-30T09:15',
      false,
    )
    expect(f).toMatchObject({
      title: 'Call the bank #money',
      due: '2026-10-30',
      time: '09:05',
      priority: 2,
      snoozeUntil: '2026-10-30T09:15',
      repeatWeekday: null,
    })
  })

  it('is Normal priority with no tokens', () => {
    expect(parseTaskText('Just text', false)).toMatchObject({
      title: 'Just text',
      priority: 3,
      due: null,
      time: null,
    })
  })

  it('reads a weekly repeat in any case', () => {
    expect(parseTaskText('Bins every Tuesday', false).repeatWeekday).toBe(2)
  })

  it('leaves a > that is not a date in the text', () => {
    expect(parseTaskText('a > b', false).title).toBe('a > b')
  })
})

describe('parseTasks', () => {
  const tasks = parseTasks('Week.md', NOTE)

  it('finds checkbox lines outside frontmatter and code', () => {
    expect(tasks.map((t) => t.title)).toEqual([
      'Call the bank #money',
      'Find the letter',
      'Gym',
      'Book flights',
    ])
  })

  it('records where each one is and what it says', () => {
    expect(tasks[0]).toMatchObject({
      id: 'Week.md:6',
      line: 6,
      raw: '- [ ] Call the bank >2026-10-30 09:00 !2 #money',
      tags: ['money'],
      done: false,
    })
    expect(tasks[1]).toMatchObject({ done: true, completed: '2026-10-27', parentLine: 6 })
    expect(tasks[2]).toMatchObject({ repeat: 'weekly', repeatWeekday: 1, parentLine: null })
    expect(tasks[3]).toMatchObject({ done: true, completed: null })
  })

  it('reads no tasks from a note marked as a list', () => {
    expect(parseTasks('Shop.md', '---\ntitle: Shop\ntype: list\n---\n- [ ] Milk')).toEqual([])
  })

  it('nests subtasks under their parents', () => {
    const roots = nestTasks(tasks)
    expect(roots.map((t) => t.children.map((c) => c.title))).toEqual([['Find the letter'], [], []])
  })
})

describe('editing a task in its note', () => {
  const bank = () => parseTasks('Week.md', NOTE)[0]!

  it('rewrites only its line', () => {
    const next = editTaskInText(NOTE, bank(), (f, l) => [
      formatTaskLine({ ...f, priority: 1 }, l.indent, l.bullet),
    ])
    const lines = next.split('\n')
    expect(lines[6]).toBe('- [ ] Call the bank #money >2026-10-30 09:00 !1')
    expect(lines.filter((_, i) => i !== 6)).toEqual(NOTE.split('\n').filter((_, i) => i !== 6))
  })

  it('finds it by its text when lines above it moved', () => {
    const moved = `Intro\n\n${NOTE}`
    const next = editTaskInText(moved, bank(), (f, l) => toggledLines(f, l, new Date(2026, 9, 29)))
    expect(next.split('\n')[8]).toBe(
      '- [x] Call the bank #money >2026-10-30 09:00 !2 done:2026-10-29',
    )
  })

  it('says so when the line is gone', () => {
    expect(() => editTaskInText('nothing here', bank(), () => [])).toThrow(TaskNotFoundError)
  })

  it('removes a task with its subtasks', () => {
    const next = editTaskInText(NOTE, bank(), () => null)
    expect(next).not.toContain('Call the bank')
    expect(next).not.toContain('Find the letter')
    expect(next).toContain('- [ ] Gym')
  })

  it('adds a subtask at the end of the block, one level in', () => {
    const next = insertSubtaskInText(NOTE, bank(), 'Ask about fees')
    expect(next.split('\n').slice(6, 9)).toEqual([
      '- [ ] Call the bank >2026-10-30 09:00 !2 #money',
      '  - [x] Find the letter done:2026-10-27',
      '  - [ ] Ask about fees',
    ])
  })

  it('keeps Windows line ends', () => {
    const crlf = NOTE.replace(/\n/g, '\r\n')
    const next = editTaskInText(crlf, bank(), (f, l) => toggledLines(f, l))
    expect(next.split('\r\n')).toHaveLength(NOTE.split('\n').length)
  })
})

describe('ticking', () => {
  const now = new Date(2026, 9, 29, 10)
  const line = { indent: '', bullet: '-' }

  it('records the day and drops a snooze; unticking takes the day off', () => {
    const f = parseTaskText('Pay rent >2026-10-29 09:00 snooze:2026-10-29T09:30', false)
    const [done] = toggledLines(f, line, now)
    expect(done).toBe('- [x] Pay rent >2026-10-29 09:00 done:2026-10-29')
    const again = toggledLines(parseTaskText(done!.slice(6), true), line, now)
    expect(again).toEqual(['- [ ] Pay rent >2026-10-29 09:00'])
  })

  it('puts the next one of a weekly task above it', () => {
    const f = parseTaskText('Gym >2026-10-26 every monday', false)
    expect(toggledLines(f, line, now)).toEqual([
      '- [ ] Gym >2026-11-02 every monday',
      '- [x] Gym >2026-10-26 every monday done:2026-10-29',
    ])
  })

  it('sets and clears the done token without touching the rest', () => {
    expect(withDoneToken('**Bold** thing >2026-10-29', '2026-10-29')).toBe(
      '**Bold** thing >2026-10-29 done:2026-10-29',
    )
    expect(withDoneToken('Thing done:2026-10-29', null)).toBe('Thing')
  })
})

describe('task lines in the editor', () => {
  it('come back from the editor as written', () => {
    const md = [
      '- [ ] Call the bank >2026-10-30 09:00 !2 #money',
      '  - [x] Find the letter done:2026-10-27',
      '- [ ] Gym >2026-10-28 every monday snooze:2026-10-28T09:30',
    ].join('\n')
    expect(tiptapJSONToMarkdown(markdownToTiptapJSON(md)).trim()).toBe(md)
  })
})
