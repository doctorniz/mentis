'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import {
  Bold,
  Code,
  Film,
  Heading1,
  Heading2,
  Heading3,
  ImageIcon,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Strikethrough,
  Sigma,
  Table2,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import type { FileSystemAdapter } from '@/lib/fs'
import { InsertMediaDialog } from '@/components/notes/insert-media-dialog'
import { InsertLinkDialog } from '@/components/notes/insert-link-dialog'

/* ------------------------------------------------------------------ */
/* Primitives                                                           */
/* ------------------------------------------------------------------ */

function ToolbarBtn({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  title: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex size-8 items-center justify-center rounded-md transition-colors disabled:opacity-40',
        active
          ? 'bg-accent/10 text-accent'
          : 'text-fg-secondary hover:bg-bg-hover hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}

function Separator() {
  return <span className="bg-border mx-0.5 h-5 w-px shrink-0" aria-hidden />
}

/* ------------------------------------------------------------------ */
/* Table size picker popover                                            */
/* ------------------------------------------------------------------ */

function TablePicker({ onPick }: { onPick: (rows: number, cols: number) => void }) {
  const [hover, setHover] = useState<[number, number] | null>(null)
  const MAX = 6

  return (
    <div className="border-border bg-bg shadow-lg absolute top-full left-0 z-50 mt-1 rounded-lg border p-2">
      <p className="text-fg-muted mb-2 text-center text-xs">
        {hover ? `${hover[0]} × ${hover[1]}` : 'Insert table'}
      </p>
      <div
        className="grid gap-0.5"
        style={{ gridTemplateColumns: `repeat(${MAX}, 1.375rem)` }}
      >
        {Array.from({ length: MAX * MAX }, (_, i) => {
          const r = Math.floor(i / MAX) + 1
          const c = (i % MAX) + 1
          const active = hover ? r <= hover[0] && c <= hover[1] : false
          return (
            <button
              key={i}
              type="button"
              aria-label={`${r}×${c} table`}
              className={cn(
                'size-5 rounded-sm border transition-colors',
                active
                  ? 'border-accent bg-accent/20'
                  : 'border-border bg-bg-secondary hover:border-accent/50',
              )}
              onMouseEnter={() => setHover([r, c])}
              onMouseLeave={() => setHover(null)}
              onClick={() => onPick(r, c)}
            />
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Math insert popover                                                   */
/* ------------------------------------------------------------------ */

function MathPicker({ onPick }: { onPick: (type: 'mathInline' | 'mathBlock') => void }) {
  return (
    <div className="border-border bg-bg shadow-lg absolute top-full left-0 z-50 mt-1 flex min-w-max flex-col rounded-lg border p-1">
      <button
        type="button"
        onClick={() => onPick('mathInline')}
        className="hover:bg-bg-hover text-fg flex items-center gap-2 rounded-md px-3 py-1.5 text-sm"
      >
        <span className="font-mono text-xs opacity-60">$…$</span>
        <span>Inline math</span>
      </button>
      <button
        type="button"
        onClick={() => onPick('mathBlock')}
        className="hover:bg-bg-hover text-fg flex items-center gap-2 rounded-md px-3 py-1.5 text-sm"
      >
        <span className="font-mono text-xs opacity-60">$$…$$</span>
        <span>Math block</span>
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Main toolbar                                                         */
/* ------------------------------------------------------------------ */

export type InsertImageFn = (vaultPath: string, fileName: string) => Promise<void>
export type InsertVideoFn = (vaultPath: string) => void

export function NoteEditorToolbar({
  editor,
  vaultFs,
  allPaths = [],
  attachmentFolder = '_assets',
  onInsertImage,
  onInsertVideo,
}: {
  editor: Editor | null
  vaultFs?: FileSystemAdapter
  allPaths?: string[]
  attachmentFolder?: string
  onInsertImage?: InsertImageFn
  onInsertVideo?: InsertVideoFn
}) {
  const [imageDialogOpen, setImageDialogOpen] = useState(false)
  const [videoDialogOpen, setVideoDialogOpen] = useState(false)
  const [tablePicker, setTablePicker] = useState(false)
  const [mathPicker, setMathPicker] = useState(false)
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [canvasDialogOpen, setCanvasDialogOpen] = useState(false)

  if (!editor) return null

  function insertMath(type: 'mathInline' | 'mathBlock') {
    setMathPicker(false)
    editor!.chain().focus().insertContent({ type, attrs: { latex: '' } }).run()
  }

  function insertTable(rows: number, cols: number) {
    setTablePicker(false)
    editor!
      .chain()
      .focus()
      .insertTable({ rows, cols, withHeaderRow: true })
      .run()
  }

  function insertWikiLink(path: string) {
    // strip leading slash if present
    const target = path.replace(/^\/+/, '')
    const basename = target.split('/').pop() ?? target
    const label = basename.replace(/\.[^/.]+$/, '') // strip extension for display
    editor!
      .chain()
      .focus()
      .insertContent({
        type: 'wikiLink',
        attrs: { target, label },
      })
      .run()
  }

  return (
    <>
      <div
        className="border-border flex flex-wrap items-center gap-0.5 border-b px-2 py-1"
        role="toolbar"
        aria-label="Formatting"
      >
        {/* ── Inline formatting ── */}
        <ToolbarBtn
          title="Bold (Ctrl+B)"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="size-4" />
        </ToolbarBtn>
        <ToolbarBtn
          title="Italic (Ctrl+I)"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-4" />
        </ToolbarBtn>
        <ToolbarBtn
          title="Strikethrough"
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="size-4" />
        </ToolbarBtn>
        <ToolbarBtn
          title="Inline code"
          active={editor.isActive('code')}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code className="size-4" />
        </ToolbarBtn>

        <Separator />

        {/* ── Headings ── */}
        <ToolbarBtn
          title="Heading 1"
          active={editor.isActive('heading', { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          <Heading1 className="size-4" />
        </ToolbarBtn>
        <ToolbarBtn
          title="Heading 2"
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="size-4" />
        </ToolbarBtn>
        <ToolbarBtn
          title="Heading 3"
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 className="size-4" />
        </ToolbarBtn>

        <Separator />

        {/* ── Lists & blocks ── */}
        <ToolbarBtn
          title="Bullet list"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="size-4" />
        </ToolbarBtn>
        <ToolbarBtn
          title="Numbered list"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="size-4" />
        </ToolbarBtn>
        <ToolbarBtn
          title="Task list"
          active={editor.isActive('taskList')}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
        >
          <ListChecks className="size-4" />
        </ToolbarBtn>
        <ToolbarBtn
          title="Blockquote"
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="size-4" />
        </ToolbarBtn>
        <ToolbarBtn
          title="Horizontal rule"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          <Minus className="size-4" />
        </ToolbarBtn>

        <Separator />

        {/* ── Insert ── */}

        {/* Image */}
        <ToolbarBtn
          title="Insert image"
          onClick={() => setImageDialogOpen(true)}
          disabled={!vaultFs || !onInsertImage}
        >
          <ImageIcon className="size-4" />
        </ToolbarBtn>

        {/* Video */}
        <ToolbarBtn
          title="Insert video"
          onClick={() => setVideoDialogOpen(true)}
          disabled={!vaultFs || !onInsertVideo}
        >
          <Film className="size-4" />
        </ToolbarBtn>

        {/* Table */}
        <div className="relative">
          <ToolbarBtn
            title="Insert table"
            active={tablePicker}
            onClick={() => { setTablePicker((v) => !v); setMathPicker(false) }}
          >
            <Table2 className="size-4" />
          </ToolbarBtn>
          {tablePicker && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setTablePicker(false)} />
              <TablePicker onPick={insertTable} />
            </>
          )}
        </div>

        {/* Math */}
        <div className="relative">
          <ToolbarBtn
            title="Insert math"
            active={mathPicker || editor.isActive('mathInline') || editor.isActive('mathBlock')}
            onClick={() => { setMathPicker((v) => !v); setTablePicker(false) }}
          >
            <Sigma className="size-4" />
          </ToolbarBtn>
          {mathPicker && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMathPicker(false)} />
              <MathPicker onPick={insertMath} />
            </>
          )}
        </div>

        <Separator />

        {/* ── Links ── */}

        {/* Link to any vault file */}
        <ToolbarBtn
          title="Link to file"
          onClick={() => setLinkDialogOpen(true)}
        >
          <Link2 className="size-4" />
        </ToolbarBtn>

        {/* Canvas-specific quick link */}
        {allPaths.some((p) => p.endsWith('.canvas')) && (
          <ToolbarBtn
            title="Link to canvas"
            onClick={() => setCanvasDialogOpen(true)}
          >
            {/* Reuse the presentation icon for canvas */}
            <svg
              viewBox="0 0 16 16"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="1" y="1" width="14" height="10" rx="1.5" />
              <path d="M5 14h6M8 11v3" />
              <path d="M5 5l2 2 4-4" />
            </svg>
          </ToolbarBtn>
        )}
      </div>

      {/* ── Dialogs ── */}

      {vaultFs && onInsertImage && (
        <InsertMediaDialog
          open={imageDialogOpen}
          mode="image"
          attachmentFolder={attachmentFolder}
          onInsert={(path, name) => void onInsertImage(path, name)}
          onClose={() => setImageDialogOpen(false)}
        />
      )}

      {vaultFs && onInsertVideo && (
        <InsertMediaDialog
          open={videoDialogOpen}
          mode="video"
          attachmentFolder={attachmentFolder}
          onInsert={(path) => onInsertVideo(path)}
          onClose={() => setVideoDialogOpen(false)}
        />
      )}

      <InsertLinkDialog
        open={linkDialogOpen}
        title="Link to file"
        allPaths={allPaths}
        onInsert={insertWikiLink}
        onClose={() => setLinkDialogOpen(false)}
      />

      <InsertLinkDialog
        open={canvasDialogOpen}
        filterExt=".canvas"
        title="Link to canvas"
        allPaths={allPaths}
        onInsert={insertWikiLink}
        onClose={() => setCanvasDialogOpen(false)}
      />
    </>
  )
}
