import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { Bold, Heading, Italic, Link2, Underline } from 'lucide-react'
import { getSlashDialogHandlers } from '@/lib/editor/slash-dialog-bridge'
import { cn } from '@/utils/cn'

const BAR_HEIGHT = 40
const GAP = 8

function MenuBtn({
  title,
  active,
  onClick,
  children,
}: {
  title: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex size-8 items-center justify-center rounded-md transition-colors',
        active ? 'bg-accent/10 text-accent' : 'text-fg-secondary hover:bg-bg-hover hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}

/**
 * The few formats a note needs, shown next to selected text: bold, italic,
 * underline, heading and a link to a note. Everything else is in the `/` menu.
 *
 * Like the table controls, a plain overlay inside the editor's scroll column
 * rather than a Tiptap `BubbleMenu` (tippy reparents its node out of React's
 * tree). On touch it sits below the selection, clear of the system's own
 * copy and paste menu above it.
 */
export function SelectionMenu({
  editor,
  scrollContainer,
}: {
  editor: Editor | null
  scrollContainer: React.RefObject<HTMLDivElement | null>
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!editor) return
    const below = window.matchMedia('(pointer: coarse)').matches

    const update = () => {
      const { selection } = editor.state
      const container = scrollContainer.current
      if (
        editor.isDestroyed ||
        !editor.isEditable ||
        !editor.isFocused ||
        !(selection instanceof TextSelection) ||
        selection.empty ||
        !container ||
        !editor.state.doc.textBetween(selection.from, selection.to).trim()
      ) {
        setPos(null)
        return
      }
      const start = editor.view.coordsAtPos(selection.from)
      const end = editor.view.coordsAtPos(selection.to)
      const box = container.getBoundingClientRect()
      const top = below
        ? end.bottom - box.top + container.scrollTop + GAP
        : start.top - box.top + container.scrollTop - BAR_HEIGHT - GAP
      setPos({
        top: Math.max(4, top),
        left: Math.max(8, Math.min(start.left - box.left, box.width - 200)),
      })
    }

    const hide = () => setPos(null)
    editor.on('selectionUpdate', update)
    editor.on('transaction', update)
    editor.on('focus', update)
    editor.on('blur', hide)
    update()
    return () => {
      editor.off('selectionUpdate', update)
      editor.off('transaction', update)
      editor.off('focus', update)
      editor.off('blur', hide)
    }
  }, [editor, scrollContainer])

  if (!editor || !pos) return null

  return (
    <div
      role="toolbar"
      aria-label="Format"
      style={{ top: pos.top, left: pos.left }}
      // Keep the selection while a button is pressed.
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => e.preventDefault()}
      className="border-border bg-bg absolute z-20 flex items-center gap-0.5 rounded-lg border p-1 shadow-lg"
    >
      <MenuBtn
        title="Bold"
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="size-4" />
      </MenuBtn>
      <MenuBtn
        title="Italic"
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="size-4" />
      </MenuBtn>
      <MenuBtn
        title="Underline"
        active={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <Underline className="size-4" />
      </MenuBtn>
      <MenuBtn
        title="Heading"
        active={editor.isActive('heading')}
        onClick={() =>
          editor.isActive('heading')
            ? editor.chain().focus().setParagraph().run()
            : editor.chain().focus().setHeading({ level: 2 }).run()
        }
      >
        <Heading className="size-4" />
      </MenuBtn>
      <MenuBtn title="Link to a note" onClick={() => getSlashDialogHandlers()?.openLinkDialog()}>
        <Link2 className="size-4" />
      </MenuBtn>
    </div>
  )
}
