'use client'

import type { Editor } from '@tiptap/core'
import { BubbleMenu } from '@tiptap/react'
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
 */
export function TableControlsMenu({ editor }: { editor: Editor | null }) {
  if (!editor) return null

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="tableControls"
      shouldShow={({ editor: ed }) => ed.isActive('table')}
      updateDelay={0}
      tippyOptions={{ placement: 'top', offset: [0, 8] }}
    >
      <div
        role="toolbar"
        aria-label="Table"
        className="border-border bg-bg flex items-center gap-0.5 rounded-lg border p-1 shadow-lg"
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
    </BubbleMenu>
  )
}
