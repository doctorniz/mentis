'use client'

import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/core'
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  ArrowDownToLine,
  Columns3,
  Rows3,
  Trash2,
} from 'lucide-react'
import { cn } from '@/utils/cn'

function MenuBtn({
  title,
  onClick,
  danger,
  children,
}: {
  title: string
  onClick: () => void
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        'flex size-7 items-center justify-center rounded-md transition-colors',
        danger
          ? 'text-danger hover:bg-danger/10'
          : 'text-fg-secondary hover:bg-bg-hover hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}

function Sep() {
  return <span className="bg-border mx-0.5 h-5 w-px shrink-0" aria-hidden />
}

/**
 * Floating controls shown while the cursor sits inside a table — tables
 * can be inserted from the toolbar/slash menu but had no way to grow,
 * shrink, or remove afterward.
 *
 * Deliberately NOT a Tiptap `BubbleMenu`: tippy reparents its content
 * element out of React's tree, which crashes with `removeChild` errors
 * when the menu or `EditorContent` unmounts (mode switch, tab switch).
 * Instead this is a plain absolutely-positioned overlay inside the
 * editor's scroll container, so it scrolls with the table it annotates
 * and React owns every node.
 */
export function TableControlsMenu({
  editor,
  scrollContainer,
}: {
  editor: Editor | null
  /** The scrollable editor column; the toolbar positions inside it. */
  scrollContainer: React.RefObject<HTMLDivElement | null>
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!editor) return

    const update = () => {
      if (editor.isDestroyed || !editor.isEditable || !editor.isActive('table')) {
        setPos(null)
        return
      }
      const container = scrollContainer.current
      if (!container) {
        setPos(null)
        return
      }
      const { $from } = editor.state.selection
      let tableDepth = -1
      for (let d = $from.depth; d > 0; d--) {
        if ($from.node(d).type.name === 'table') {
          tableDepth = d
          break
        }
      }
      if (tableDepth === -1) {
        setPos(null)
        return
      }
      const dom = editor.view.nodeDOM($from.before(tableDepth))
      if (!(dom instanceof HTMLElement) || !container.contains(dom)) {
        setPos(null)
        return
      }
      const tableRect = dom.getBoundingClientRect()
      const contRect = container.getBoundingClientRect()
      setPos({
        // Sit just above the table; clamp so a table at the very top
        // doesn't push the toolbar out of the scroll area.
        top: Math.max(4, tableRect.top - contRect.top + container.scrollTop - 44),
        left: Math.max(8, tableRect.left - contRect.left + container.scrollLeft),
      })
    }

    editor.on('transaction', update)
    update()
    return () => {
      editor.off('transaction', update)
    }
  }, [editor, scrollContainer])

  if (!editor || !pos) return null

  return (
    <div
      role="toolbar"
      aria-label="Table"
      style={{ top: pos.top, left: pos.left }}
      // Keep the editor's selection/focus when clicking toolbar buttons.
      onMouseDown={(e) => e.preventDefault()}
      className="border-border bg-bg absolute z-20 flex items-center gap-0.5 rounded-lg border p-1 shadow-lg"
    >
      <MenuBtn title="Add row above" onClick={() => editor.chain().focus().addRowBefore().run()}>
        <ArrowUpToLine className="size-3.5" />
      </MenuBtn>
      <MenuBtn title="Add row below" onClick={() => editor.chain().focus().addRowAfter().run()}>
        <ArrowDownToLine className="size-3.5" />
      </MenuBtn>
      <MenuBtn title="Delete row" onClick={() => editor.chain().focus().deleteRow().run()}>
        <Rows3 className="size-3.5" />
      </MenuBtn>

      <Sep />

      <MenuBtn
        title="Add column left"
        onClick={() => editor.chain().focus().addColumnBefore().run()}
      >
        <ArrowLeftToLine className="size-3.5" />
      </MenuBtn>
      <MenuBtn
        title="Add column right"
        onClick={() => editor.chain().focus().addColumnAfter().run()}
      >
        <ArrowRightToLine className="size-3.5" />
      </MenuBtn>
      <MenuBtn title="Delete column" onClick={() => editor.chain().focus().deleteColumn().run()}>
        <Columns3 className="size-3.5" />
      </MenuBtn>

      <Sep />

      <MenuBtn
        title="Toggle header row"
        onClick={() => editor.chain().focus().toggleHeaderRow().run()}
      >
        <span className="text-xs font-semibold">H</span>
      </MenuBtn>

      <Sep />

      <MenuBtn
        title="Delete table"
        danger
        onClick={() => editor.chain().focus().deleteTable().run()}
      >
        <Trash2 className="size-3.5" />
      </MenuBtn>
    </div>
  )
}
