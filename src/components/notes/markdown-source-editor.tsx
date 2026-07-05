'use client'

import { useEffect, useRef } from 'react'
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  rectangularSelection,
} from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { markdown } from '@codemirror/lang-markdown'
import { inkEditorTheme, inkHighlightStyle } from '@/lib/code/codemirror-theme'
import { cn } from '@/utils/cn'

/**
 * CodeMirror 6 editor for the markdown note's raw-source view. Uncontrolled
 * by design, mirroring `code-file-editor.tsx`: `initialValue` seeds the doc
 * once on mount and `onChange` streams edits back out. The note editor
 * mounts/unmounts this component on each Visual/Source toggle, so a fresh
 * `initialValue` on every mount is exactly the intended behavior — there's
 * no need to reconcile external prop updates against live cursor state.
 */
export function MarkdownSourceEditor({
  initialValue,
  onChange,
  className,
  initialScrollFraction,
  scrollElementRef,
}: {
  initialValue: string
  onChange: (value: string) => void
  className?: string
  /** 0–1 scroll position to restore after mount (from the visual editor's scroll state). */
  initialScrollFraction?: number
  /** Receives the scrolling element so the parent can capture scroll state on mode switch. */
  scrollElementRef?: React.MutableRefObject<HTMLDivElement | null>
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!containerRef.current) return

    const view = new EditorView({
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          rectangularSelection(),
          highlightSelectionMatches(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
          markdown(),
          inkEditorTheme,
          inkHighlightStyle,
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString())
            }
          }),
        ],
      }),
      parent: containerRef.current,
    })

    view.focus()

    // Restore the visual editor's scroll position proportionally once the
    // document has been measured (rAF: CodeMirror needs a layout pass).
    if (initialScrollFraction != null && initialScrollFraction > 0) {
      const el = containerRef.current
      requestAnimationFrame(() => {
        el.scrollTop = initialScrollFraction * Math.max(0, el.scrollHeight - el.clientHeight)
      })
    }

    return () => {
      view.destroy()
    }
    // Mount fresh each time this component mounts (i.e. each Visual→Source
    // toggle) — initialValue is a one-time seed, not a controlled prop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={(el) => {
        containerRef.current = el
        if (scrollElementRef) scrollElementRef.current = el
      }}
      role="textbox"
      aria-label="Raw markdown source"
      aria-multiline="true"
      className={cn('min-h-0 flex-1 overflow-auto', className)}
    />
  )
}
