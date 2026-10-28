import type { TaskItem, TaskPriority } from '@/types/tasks'
import { formatLocalDate, nextWeeklyDueAfterCompletion } from '@/lib/tasks/recurrence'

/**
 * Tasks are checkbox lines in ordinary notes:
 *
 *     - [ ] Call the bank >2026-10-30 09:00 !2 #money every friday
 *         - [ ] Find the letter          (indented: a subtask)
 *     - [x] Book flights done:2026-10-27
 *
 * `>date [time]` is the due day (the time, when there is one, is the
 * reminder), `!1`–`!4` the priority, `every <weekday>` a weekly repeat,
 * `done:` the day it was ticked and `snooze:` when to remind again. Inline
 * `#tags` stay in the text. Everything here is pure string work, so the
 * indexer, the Tasks view and the editor share it.
 */

const CHECKBOX_RE = /^([ \t]*)([-*+]) \[([ xX])\](?: (.*))?$/
const FENCE_RE = /^\s*(```|~~~)/

const DUE_RE = /(^|\s)>(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}:\d{2}))?(?=\s|$)/
const PRIORITY_RE = /(^|\s)!([1-4])(?=\s|$)/
const DONE_RE = /(^|\s)done:(\d{4}-\d{2}-\d{2})(?=\s|$)/
const SNOOZE_RE = /(^|\s)snooze:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?=\s|$)/
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const EVERY_RE = new RegExp(`(^|\\s)every (${WEEKDAYS.join('|')})(?=\\s|$)`, 'i')
const TAG_RE = /(?:^|\s)#([a-zA-Z][\w/-]*)/g

/** The fields a task line carries besides its text. */
export interface TaskFields {
  title: string
  done: boolean
  completed: string | null
  due: string | null
  time: string | null
  priority: TaskPriority
  repeatWeekday: number | null
  snoozeUntil: string | null
}

function indentWidth(ws: string): number {
  let n = 0
  for (const ch of ws) n += ch === '\t' ? 4 : 1
  return n
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** `9:05` → `09:05`; anything out of range → null. */
function normalTime(t: string | undefined): string | null {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  if (h > 23 || m > 59) return null
  return `${pad2(h)}:${pad2(m)}`
}

/** Take a token out of `text`, returning its capture groups. */
function take(text: string, re: RegExp): { text: string; m: RegExpExecArray | null } {
  const m = re.exec(text)
  if (!m) return { text, m: null }
  return { text: text.slice(0, m.index) + m[1] + text.slice(m.index + m[0].length), m }
}

/** The fields of a checkbox line's content (what follows `- [ ] `). */
export function parseTaskText(content: string, checked: boolean): TaskFields {
  let text = content
  let r = take(text, DUE_RE)
  text = r.text
  const due = r.m ? r.m[2] : null
  const time = r.m ? normalTime(r.m[3]) : null
  r = take(text, PRIORITY_RE)
  text = r.text
  const priority = (r.m ? Number(r.m[2]) : 3) as TaskPriority
  r = take(text, DONE_RE)
  text = r.text
  const completed = r.m ? r.m[2] : null
  r = take(text, SNOOZE_RE)
  text = r.text
  const snoozeUntil = r.m ? r.m[2] : null
  r = take(text, EVERY_RE)
  text = r.text
  const repeatWeekday = r.m ? WEEKDAYS.indexOf(r.m[2].toLowerCase()) : null
  return {
    title: text.replace(/\s+/g, ' ').trim(),
    done: checked,
    completed,
    due,
    time,
    priority,
    repeatWeekday,
    snoozeUntil,
  }
}

export function tagsOf(title: string): string[] {
  return [...new Set([...title.matchAll(TAG_RE)].map((m) => m[1].toLowerCase()))]
}

/** The content to write after `- [ ] ` for these fields. */
export function formatTaskText(f: TaskFields): string {
  const parts = [f.title.trim()]
  if (f.due) parts.push(`>${f.due}${f.time ? ` ${f.time}` : ''}`)
  if (f.priority !== 3) parts.push(`!${f.priority}`)
  if (f.repeatWeekday != null) parts.push(`every ${WEEKDAYS[f.repeatWeekday]}`)
  if (f.snoozeUntil && !f.done) parts.push(`snooze:${f.snoozeUntil}`)
  if (f.done && f.completed) parts.push(`done:${f.completed}`)
  return parts.filter(Boolean).join(' ')
}

/** A whole checkbox line for these fields, at `indent` (the leading whitespace) with `bullet`. */
export function formatTaskLine(f: TaskFields, indent = '', bullet = '-'): string {
  return `${indent}${bullet} [${f.done ? 'x' : ' '}] ${formatTaskText(f)}`
}

/** Frontmatter at the top of a note: its lines are not tasks. */
function frontmatterEnd(lines: string[]): number {
  if (lines[0]?.trim() !== '---') return 0
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---' || lines[i].trim() === '...') return i + 1
  }
  return 0
}

/** Every task in a note, in file order, with subtasks linked by `parentLine` (children left empty). */
export function parseTasks(path: string, text: string): TaskItem[] {
  const lines = text.split(/\r?\n/)
  const out: TaskItem[] = []
  // Open tasks above the current line, innermost last: a deeper task is a subtask.
  const stack: TaskItem[] = []
  let fenced = false
  for (let i = frontmatterEnd(lines); i < lines.length; i++) {
    const line = lines[i]
    if (FENCE_RE.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    const m = CHECKBOX_RE.exec(line)
    if (!m) {
      // A blank line keeps a list going; any other line at or left of a task ends it.
      if (line.trim()) {
        const w = indentWidth(/^[ \t]*/.exec(line)![0])
        while (stack.length && stack[stack.length - 1].indent >= w) stack.pop()
      }
      continue
    }
    const indent = indentWidth(m[1])
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
    const fields = parseTaskText(m[4] ?? '', m[3] !== ' ')
    const task: TaskItem = {
      ...fields,
      id: `${path}:${i}`,
      path,
      line: i,
      raw: line,
      indent,
      tags: tagsOf(fields.title),
      repeat: fields.repeatWeekday != null ? 'weekly' : null,
      parentLine: stack.length ? stack[stack.length - 1].line : null,
      children: [],
    }
    out.push(task)
    stack.push(task)
  }
  return out
}

/** Tasks nested under their parents. Children keep file order. */
export function nestTasks(flat: readonly TaskItem[]): TaskItem[] {
  const byId = new Map(flat.map((t) => [t.id, { ...t, children: [] as TaskItem[] }]))
  const roots: TaskItem[] = []
  for (const t of byId.values()) {
    const parent = t.parentLine != null ? byId.get(`${t.path}:${t.parentLine}`) : undefined
    if (parent) parent.children.push(t)
    else roots.push(t)
  }
  return roots
}

export class TaskNotFoundError extends Error {
  constructor(task: Pick<TaskItem, 'path' | 'title'>) {
    super(`"${task.title}" is no longer in ${task.path}`)
  }
}

/** Where `task` is in `lines` now: its line if unchanged, else the first line with its text. */
export function locateTask(lines: readonly string[], task: Pick<TaskItem, 'line' | 'raw'>): number {
  if (lines[task.line] === task.raw) return task.line
  return lines.indexOf(task.raw)
}

/** The lines `task` spans: its own and every deeper or blank line under it. */
function blockEnd(lines: readonly string[], start: number): number {
  const w = indentWidth(/^[ \t]*/.exec(lines[start])![0])
  let end = start + 1
  let last = start
  while (end < lines.length) {
    const line = lines[end]
    if (line.trim()) {
      if (indentWidth(/^[ \t]*/.exec(line)![0]) <= w) break
      last = end
    }
    end++
  }
  return last + 1
}

/** The note's text with `task`'s line rewritten by `edit`, or its block removed when `edit` returns null. */
export function editTaskInText(
  text: string,
  task: Pick<TaskItem, 'path' | 'title' | 'line' | 'raw'>,
  edit: (fields: TaskFields, line: { indent: string; bullet: string }) => string[] | null,
): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)
  const at = locateTask(lines, task)
  const m = at >= 0 ? CHECKBOX_RE.exec(lines[at]) : null
  if (!m) throw new TaskNotFoundError(task)
  const next = edit(parseTaskText(m[4] ?? '', m[3] !== ' '), { indent: m[1], bullet: m[2] })
  if (next === null) lines.splice(at, blockEnd(lines, at) - at)
  else lines.splice(at, 1, ...next)
  return lines.join(eol)
}

/**
 * Tick or untick. Ticking records `done:` and drops a snooze; ticking a
 * weekly task also puts a fresh, open copy above it, due on the next one.
 */
export function toggledLines(
  f: TaskFields,
  line: { indent: string; bullet: string },
  now = new Date(),
): string[] {
  if (f.done) {
    return [formatTaskLine({ ...f, done: false, completed: null }, line.indent, line.bullet)]
  }
  const done = formatTaskLine(
    { ...f, done: true, completed: formatLocalDate(now), snoozeUntil: null },
    line.indent,
    line.bullet,
  )
  if (f.repeatWeekday == null) return [done]
  const again = formatTaskLine(
    {
      ...f,
      done: false,
      completed: null,
      snoozeUntil: null,
      due: nextWeeklyDueAfterCompletion(now, f.repeatWeekday),
    },
    line.indent,
    line.bullet,
  )
  return [again, done]
}

/**
 * A checkbox's text with its `done:` token set to `day`, or taken out when
 * `day` is null. Only that token changes, so the rest stays as written.
 */
export function withDoneToken(content: string, day: string | null): string {
  const without = take(content, DONE_RE).text.replace(/\s+$/, '')
  return day ? `${without} done:${day}` : without
}

/** The fields of a new, open task with nothing but its text. */
export function newTaskFields(title: string): TaskFields {
  return {
    title,
    done: false,
    completed: null,
    due: null,
    time: null,
    priority: 3,
    repeatWeekday: null,
    snoozeUntil: null,
  }
}

/** The note's text with a subtask added at the end of `task`'s block, one level deeper. */
export function insertSubtaskInText(
  text: string,
  task: Pick<TaskItem, 'path' | 'title' | 'line' | 'raw'>,
  title: string,
): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)
  const at = locateTask(lines, task)
  const m = at >= 0 ? CHECKBOX_RE.exec(lines[at]) : null
  if (!m) throw new TaskNotFoundError(task)
  const indent = m[1] + (m[1].includes('\t') ? '\t' : '  ')
  lines.splice(blockEnd(lines, at), 0, formatTaskLine(newTaskFields(title), indent, m[2]))
  return lines.join(eol)
}
