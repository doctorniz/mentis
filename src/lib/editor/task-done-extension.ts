import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Mapping } from '@tiptap/pm/transform'
import { formatTaskText, parseTaskText } from '@/lib/tasks/line'
import { formatLocalDate, nextWeeklyDueAfterCompletion } from '@/lib/tasks/recurrence'

/** Tokens a tick rewrites; everything else in the checkbox's text is left alone. */
const DONE_RE = /\s?done:\d{4}-\d{2}-\d{2}(?=\s|$)/
const SNOOZE_RE = /\s?snooze:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?=\s|$)/
const LEAF = '￼'

/** `done:YYYY-MM-DD` anywhere in a task's text, for hiding it. */
const DONE_SHOWN_RE = /\s?done:\d{4}-\d{2}-\d{2}(?=\s|$)/g

/** A task's `done:` date is kept in the file but not shown: the tick says it. */
function hiddenDoneDates(state: EditorState): DecorationSet {
  const decorations: Decoration[] = []
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'taskItem') return true
    const para = textBlock(node)
    if (!para) return false
    const text = para.textBetween(0, para.content.size, undefined, LEAF)
    for (const m of text.matchAll(DONE_SHOWN_RE)) {
      const from = pos + 2 + m.index
      decorations.push(Decoration.inline(from, from + m[0].length, { class: 'task-done-date' }))
    }
    return true
  })
  return DecorationSet.create(state.doc, decorations)
}

/** The paragraph a task item's text is in: its first child. */
function textBlock(item: PMNode): PMNode | null {
  const first = item.firstChild
  return first?.isTextblock ? first : null
}

/** Remove `re` from the paragraph that starts at `from` (its opening position). */
function removeToken(tr: Transaction, paraPos: number, re: RegExp): void {
  const para = tr.doc.nodeAt(paraPos)
  if (!para) return
  // Leaves count one character each, so text offsets are positions.
  const text = para.textBetween(0, para.content.size, undefined, LEAF)
  const m = re.exec(text)
  if (m) tr.delete(paraPos + 1 + m.index, paraPos + 1 + m.index + m[0].length)
}

/**
 * Ticking a checkbox in a note keeps its task line true: it writes
 * `done:YYYY-MM-DD` and drops a snooze; unticking takes `done:` off. Ticking
 * a weekly task (`every monday`) puts a fresh, open copy above it, due on the
 * next one — as the Tasks view does. Only items whose tick changed in this
 * edit are touched, so opening an old note never rewrites it.
 */
export const TaskDone = Extension.create({
  name: 'taskDone',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('taskDone'),
        appendTransaction(transactions, oldState, newState) {
          if (!transactions.some((t) => t.docChanged)) return null
          if (transactions.some((t) => t.getMeta('taskDone'))) return null
          const back = new Mapping()
          for (const t of transactions) back.appendMapping(t.mapping)
          const inverse = back.invert()

          const changed: { pos: number; node: PMNode }[] = []
          newState.doc.descendants((node, pos) => {
            if (node.type.name !== 'taskItem') return true
            const before = oldState.doc.nodeAt(inverse.map(pos, 1))
            if (before?.type.name === 'taskItem' && before.attrs.checked !== node.attrs.checked) {
              changed.push({ pos, node })
            }
            return true
          })
          if (changed.length === 0) return null

          const tr = newState.tr.setMeta('taskDone', true)
          const now = new Date()
          // Last first, so earlier positions stay put.
          for (const { pos, node } of changed.reverse()) {
            const para = textBlock(node)
            if (!para) continue
            const paraPos = pos + 1
            removeToken(tr, paraPos, DONE_RE)
            if (!node.attrs.checked) continue
            removeToken(tr, paraPos, SNOOZE_RE)
            const end = paraPos + 1 + tr.doc.nodeAt(paraPos)!.content.size
            tr.insertText(` done:${formatLocalDate(now)}`, end)

            const fields = parseTaskText(para.textContent, false)
            if (fields.repeatWeekday == null) continue
            const next = formatTaskText({
              ...fields,
              completed: null,
              snoozeUntil: null,
              due: nextWeeklyDueAfterCompletion(now, fields.repeatWeekday),
            })
            const copy = node.type.create({ ...node.attrs, checked: false }, [
              para.type.create(para.attrs, newState.schema.text(next)),
            ])
            tr.insert(pos, copy)
          }
          return tr
        },
      }),
      new Plugin({
        key: new PluginKey('taskDoneHidden'),
        state: {
          init: (_, state) => hiddenDoneDates(state),
          apply: (tr, old, _, state) => (tr.docChanged ? hiddenDoneDates(state) : old),
        },
        props: {
          decorations(state) {
            return this.getState(state)
          },
        },
      }),
    ]
  },
})
