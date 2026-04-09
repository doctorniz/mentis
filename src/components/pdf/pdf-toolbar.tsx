'use client'

import {
  ChevronLeft,
  ChevronRight,
  FileText,
  FilePlus,
  History,
  Highlighter,
  MessageSquare,
  MousePointer2,
  PenLine,
  PenTool,
  Redo2,
  Search,
  Stamp,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { usePdfStore } from '@/stores/pdf'
import { PdfTool, HighlightColor } from '@/types/pdf'
import type { Signature } from '@/types/pdf'
import { cn } from '@/utils/cn'

function ToolBtn({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        'hover:bg-bg-hover rounded-md p-1.5 transition-colors',
        active ? 'bg-bg-active text-accent' : 'text-fg-secondary',
      )}
    >
      {children}
    </button>
  )
}

const COLORS = Object.values(HighlightColor)
/** Pen includes black first so Draw defaults off highlight pastels (P4). */
const DRAW_SWATCHES = ['#000000', ...COLORS] as const
/** FreeText: legible inks (not highlight pastels) — P14. */
const TEXT_SWATCHES = [
  '#000000',
  '#212529',
  '#495057',
  '#868e96',
  '#c92a2a',
  '#d9480f',
  '#2b8a3e',
  '#1864ab',
  '#5f3dc4',
  '#862e9c',
] as const

const COLOR_NAMES: Record<string, string> = {
  '#000000': 'Black',
  '#212529': 'Charcoal',
  '#495057': 'Gray',
  '#868e96': 'Silver',
  '#c92a2a': 'Red',
  '#d9480f': 'Orange',
  '#2b8a3e': 'Green',
  '#1864ab': 'Blue',
  '#5f3dc4': 'Violet',
  '#862e9c': 'Purple',
  '#fff3bf': 'Yellow',
  '#d3f9d8': 'Mint',
  '#d0ebff': 'Sky',
  '#fcc2d7': 'Pink',
  '#ffc9c9': 'Rose',
}
function colorName(hex: string) {
  return COLOR_NAMES[hex] ?? hex
}

export function PdfToolbar({
  onSearch,
  signatures,
  activeSignature,
  onPickSignature,
  onNewSignature,
  onOpenFormDialog,
  historyOpen,
  onToggleHistory,
  onAddPage,
  canUndo,
  onUndo,
  canRedo,
  onRedo,
}: {
  onSearch: () => void
  signatures: Signature[]
  activeSignature: Signature | null
  onPickSignature: (sig: Signature) => void
  onNewSignature: () => void
  onOpenFormDialog: () => void
  historyOpen: boolean
  onToggleHistory: () => void
  onAddPage?: () => void
  canUndo: boolean
  onUndo: () => void
  canRedo: boolean
  onRedo: () => void
}) {
  const activeTool = usePdfStore((s) => s.activeTool)
  const highlightColor = usePdfStore((s) => s.highlightColor)
  const drawColor = usePdfStore((s) => s.drawColor)
  const textColor = usePdfStore((s) => s.textColor)
  const strokeWidth = usePdfStore((s) => s.strokeWidth)
  const setActiveTool = usePdfStore((s) => s.setActiveTool)
  const setHighlightColor = usePdfStore((s) => s.setHighlightColor)
  const setDrawColor = usePdfStore((s) => s.setDrawColor)
  const setTextColor = usePdfStore((s) => s.setTextColor)
  const setStrokeWidth = usePdfStore((s) => s.setStrokeWidth)
  const currentPage = usePdfStore((s) => s.currentPage)
  const zoom = usePdfStore((s) => s.zoom)
  const setZoom = usePdfStore((s) => s.setZoom)
  const setCurrentPage = usePdfStore((s) => s.setCurrentPage)
  const doc = usePdfStore((s) => s.document)
  const pageCount = doc?.pageCount ?? 0

  return (
    <>
    <div
      className="border-border bg-bg-secondary flex flex-wrap items-center gap-1 border-b px-2 py-1.5"
      role="toolbar"
      aria-label="PDF tools"
    >
      <ToolBtn
        title="Select"
        active={activeTool === PdfTool.Select}
        onClick={() => setActiveTool(PdfTool.Select)}
      >
        <MousePointer2 className="size-4" />
      </ToolBtn>
      <ToolBtn
        title="Highlight"
        active={activeTool === PdfTool.Highlight}
        onClick={() => setActiveTool(PdfTool.Highlight)}
      >
        <Highlighter className="size-4" />
      </ToolBtn>
      <ToolBtn
        title="Draw"
        active={activeTool === PdfTool.Draw}
        onClick={() => setActiveTool(PdfTool.Draw)}
      >
        <PenTool className="size-4" />
      </ToolBtn>
      <ToolBtn
        title="Text box — click page to place; then use Select and double-click to edit"
        active={activeTool === PdfTool.Text}
        onClick={() => setActiveTool(PdfTool.Text)}
      >
        <Type className="size-4" />
      </ToolBtn>
      <ToolBtn
        title="Comment"
        active={activeTool === PdfTool.Comment}
        onClick={() => setActiveTool(PdfTool.Comment)}
      >
        <MessageSquare className="size-4" />
      </ToolBtn>
      <ToolBtn
        title="Signature stamp"
        active={activeTool === PdfTool.Sign}
        onClick={() => setActiveTool(PdfTool.Sign)}
      >
        <PenLine className="size-4" />
      </ToolBtn>

      <span className="bg-border mx-1 h-5 w-px" aria-hidden />

      {(activeTool === PdfTool.Highlight ||
        activeTool === PdfTool.Draw ||
        activeTool === PdfTool.Text) && (
        <div
          className="flex items-center gap-1"
          role="group"
          aria-label={
            activeTool === PdfTool.Highlight
              ? 'Highlighter colours'
              : activeTool === PdfTool.Draw
                ? 'Pen colours'
                : 'Text box colours'
          }
        >
          {(activeTool === PdfTool.Highlight
            ? COLORS
            : activeTool === PdfTool.Draw
              ? DRAW_SWATCHES
              : TEXT_SWATCHES
          ).map((c) => {
            const activeSwatch =
              activeTool === PdfTool.Highlight
                ? highlightColor === c
                : activeTool === PdfTool.Draw
                  ? drawColor === c
                  : textColor === c
            const kind =
              activeTool === PdfTool.Highlight
                ? 'highlight'
                : activeTool === PdfTool.Draw
                  ? 'pen'
                  : 'text'
            return (
              <button
                key={c}
                type="button"
                title={colorName(c)}
                aria-label={`${colorName(c)} ${kind} colour`}
                onClick={() => {
                  if (activeTool === PdfTool.Highlight) setHighlightColor(c)
                  else if (activeTool === PdfTool.Draw) setDrawColor(c)
                  else setTextColor(c)
                }}
                className={cn(
                  'size-5 rounded-full border-2 transition-transform',
                  activeSwatch ? 'border-accent scale-110' : 'border-transparent',
                )}
                style={{ backgroundColor: c }}
              />
            )
          })}
        </div>
      )}

      {activeTool === PdfTool.Draw && (
        <label className="text-fg-secondary ml-1 flex items-center gap-1 text-xs">
          Width
          <input
            type="range"
            min={1}
            max={12}
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(Number(e.target.value))}
            className="accent-accent w-20"
          />
          <span className="w-4 text-center">{strokeWidth}</span>
        </label>
      )}

      {activeTool === PdfTool.Sign && (
        <div className="flex items-center gap-1.5">
          {signatures.map((sig) => (
            <button
              key={sig.id}
              type="button"
              title={sig.name}
              onClick={() => onPickSignature(sig)}
              className={cn(
                'border-border rounded-md border px-2 py-0.5 text-xs transition-colors',
                activeSignature?.id === sig.id ? 'border-accent bg-accent/10' : 'hover:bg-bg-hover',
              )}
            >
              {sig.name}
            </button>
          ))}
          <button
            type="button"
            title="New signature"
            onClick={onNewSignature}
            className="text-fg-secondary hover:text-fg flex items-center gap-0.5 text-xs underline"
          >
            <Stamp className="size-3" /> New
          </button>
        </div>
      )}

      <span className="bg-border mx-1 h-5 w-px" aria-hidden />

      <ToolBtn title="Zoom out" onClick={() => setZoom(zoom - 0.25)}>
        <ZoomOut className="size-4" />
      </ToolBtn>
      <span className="text-fg-secondary min-w-[3rem] text-center text-xs">
        {Math.round(zoom * 100)}%
      </span>
      <ToolBtn title="Zoom in" onClick={() => setZoom(zoom + 0.25)}>
        <ZoomIn className="size-4" />
      </ToolBtn>

      <span className="bg-border mx-1 h-5 w-px" aria-hidden />

      <ToolBtn
        title="Previous page"
        onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
      >
        <ChevronLeft className="size-4" />
      </ToolBtn>
      <span className="text-fg-secondary min-w-[4rem] text-center text-xs">
        {currentPage + 1} / {pageCount}
      </span>
      <ToolBtn
        title="Next page"
        onClick={() => setCurrentPage(Math.min(pageCount - 1, currentPage + 1))}
      >
        <ChevronRight className="size-4" />
      </ToolBtn>
      {onAddPage && (
        <ToolBtn title="Add page" onClick={onAddPage}>
          <FilePlus className="size-4" />
        </ToolBtn>
      )}

      <span className="bg-border mx-1 h-5 w-px" aria-hidden />

      <ToolBtn title="Undo page operation (Ctrl+Z)" active={false} onClick={onUndo}>
        <Undo2 className={cn('size-4', !canUndo && 'opacity-40')} />
      </ToolBtn>
      <ToolBtn title="Redo page operation (Ctrl+Shift+Z)" active={false} onClick={onRedo}>
        <Redo2 className={cn('size-4', !canRedo && 'opacity-40')} />
      </ToolBtn>

      <span className="bg-border mx-1 h-5 w-px" aria-hidden />

      <ToolBtn title="Form fields" onClick={onOpenFormDialog}>
        <FileText className="size-4" />
      </ToolBtn>
      <ToolBtn title="Version history" active={historyOpen} onClick={onToggleHistory}>
        <History className="size-4" />
      </ToolBtn>
      <ToolBtn title="Search in document" onClick={onSearch}>
        <Search className="size-4" />
      </ToolBtn>
    </div>
    {activeTool === PdfTool.Text && (
      <div
        className="border-border bg-bg-secondary text-fg-muted border-b px-3 py-1.5 text-xs leading-relaxed"
        role="status"
        aria-live="polite"
      >
        <span className="text-fg-secondary font-medium">Text box:</span> Choose a text colour in the toolbar, then click
        a page to place. The tool switches to <span className="text-fg font-medium">Select</span> — drag the box to
        move; <span className="text-fg font-medium">double-click</span> to type or edit.
      </div>
    )}
    </>
  )
}
