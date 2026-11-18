import { Extension } from '@tiptap/core'
import type { Mark } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'

/** Text typed into an empty line longer than this is not typing (a dictated phrase is). */
const TYPED_MAX = 200

/**
 * A new line starts plain. On a phone the browser makes the new paragraph
 * itself when Enter is pressed, copying the bold (or italic…) element the
 * cursor was in, so what is typed next arrives already bold. Text typed into
 * an empty line keeps no marks unless they were switched on there (Ctrl+B,
 * or the toolbar, before typing). Links, pastes and drops are left alone.
 */
export const FreshLineMarks = Extension.create({
  name: 'freshLineMarks',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('freshLineMarks'),
        appendTransaction(transactions, oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null
          if (
            transactions.some((tr) => {
              const ui = tr.getMeta('uiEvent')
              return tr.getMeta('paste') || ui === 'paste' || ui === 'drop'
            })
          ) {
            return null
          }
          const { selection } = oldState
          const $old = selection.$from
          if (!selection.empty || !$old.parent.isTextblock || $old.parent.content.size !== 0) {
            return null
          }
          if (oldState.storedMarks?.length) return null

          let start = $old.start()
          for (const tr of transactions) start = tr.mapping.map(start, -1)
          if (start > newState.doc.content.size) return null
          const $start = newState.doc.resolve(start)
          const block = $start.parent
          if (!block.isTextblock || block.content.size === 0 || block.content.size > TYPED_MAX) {
            return null
          }

          const marks = new Map<string, Mark>()
          block.forEach((child) => {
            for (const m of child.marks) if (m.type.name !== 'link') marks.set(m.type.name, m)
          })
          if (marks.size === 0) return null
          const tr = newState.tr
          const from = $start.start()
          const to = from + block.content.size
          for (const m of marks.values()) tr.removeMark(from, to, m.type)
          return tr
        },
      }),
    ]
  },
})
