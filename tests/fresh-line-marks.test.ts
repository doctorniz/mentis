// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { FreshLineMarks } from '@/lib/editor/fresh-line-marks'

let editor: Editor | null = null
afterEach(() => editor?.destroy())

/** A bold line, then an empty one with the cursor in it (after Enter). */
function afterEnter(): Editor {
  editor = new Editor({
    extensions: [StarterKit, FreshLineMarks],
    content: '<p><strong>Bold line</strong></p><p></p>',
  })
  editor.commands.setTextSelection(12)
  return editor
}

/** What Chrome on Android sends: the typed text inside a copy of the bold element. */
function typeAsAndroid(e: Editor, text: string) {
  const bold = e.schema.marks.bold!.create()
  const at = e.state.selection.from
  e.view.dispatch(e.state.tr.insert(at, e.schema.text(text, [bold])))
}

describe('FreshLineMarks', () => {
  it('drops bold the browser carried into a new line', () => {
    const e = afterEnter()
    typeAsAndroid(e, 'plain')
    expect(e.getHTML()).toBe('<p><strong>Bold line</strong></p><p>plain</p>')
  })

  it('keeps bold switched on in the empty line', () => {
    const e = afterEnter()
    e.commands.toggleBold()
    e.view.dispatch(e.state.tr.insertText('bold'))
    expect(e.getHTML()).toBe('<p><strong>Bold line</strong></p><p><strong>bold</strong></p>')
  })

  it('keeps bold text pasted into an empty line', () => {
    const e = afterEnter()
    const bold = e.schema.marks.bold!.create()
    e.view.dispatch(
      e.state.tr.insert(12, e.schema.text('pasted', [bold])).setMeta('uiEvent', 'paste'),
    )
    expect(e.getHTML()).toBe('<p><strong>Bold line</strong></p><p><strong>pasted</strong></p>')
  })

  it('leaves a line that already had text alone', () => {
    editor = new Editor({
      extensions: [StarterKit, FreshLineMarks],
      content: '<p><strong>Bold</strong></p>',
    })
    editor.commands.setTextSelection(5)
    typeAsAndroid(editor, ' more')
    expect(editor.getHTML()).toBe('<p><strong>Bold more</strong></p>')
  })
})
