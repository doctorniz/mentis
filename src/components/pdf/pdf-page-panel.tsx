'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PDFPageProxy } from 'pdfjs-dist'
import {
  FilePlus,
  FileStack,
  RotateCw,
  Save,
  Trash2,
} from 'lucide-react'
import { usePdfStore } from '@/stores/pdf'
import { cn } from '@/utils/cn'

interface Props {
  pages: PDFPageProxy[]
  onReorder: (newOrder: number[]) => void
  onInsertBlank: (beforeIndex: number) => void
  onDelete: (index: number) => void
  onRotate: (index: number) => void
  onMerge: (files: FileList) => void
  onExtractPages: (indices: number[]) => void
}

const THUMB_W = 120

function PageThumbnail({ page, index }: { page: PDFPageProxy; index: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const vp = page.getViewport({ scale: 1 })
    const scale = THUMB_W / vp.width
    const viewport = page.getViewport({ scale })
    const w = Math.floor(viewport.width)
    const h = Math.floor(viewport.height)
    const off = document.createElement('canvas')
    off.width = w
    off.height = h
    const octx = off.getContext('2d')!
    const task = page.render({ canvasContext: octx, viewport })
    let cancelled = false
    void task.promise
      .then(() => {
        if (cancelled) return
        c.width = w
        c.height = h
        const ctx = c.getContext('2d')!
        ctx.drawImage(off, 0, 0)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      task.cancel()
    }
  }, [page, index])

  return <canvas ref={canvasRef} className="pointer-events-none w-full rounded" aria-label={`Page ${index + 1} thumbnail`} />
}

export function PdfPagePanel({
  pages,
  onReorder,
  onInsertBlank,
  onDelete,
  onRotate,
  onMerge,
  onExtractPages,
}: Props) {
  const currentPage = usePdfStore((s) => s.currentPage)
  const setCurrentPage = usePdfStore((s) => s.setCurrentPage)

  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dropIdx, setDropIdx] = useState<number | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const lastClickedRef = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setSelected(new Set())
    lastClickedRef.current = null
  }, [pages.length])

  const handleDragStart = useCallback((e: React.DragEvent, idx: number) => {
    setDragIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropIdx(idx)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent, targetIdx: number) => {
      e.preventDefault()

      if (e.dataTransfer.files.length > 0) {
        onMerge(e.dataTransfer.files)
        setDragIdx(null)
        setDropIdx(null)
        return
      }

      if (dragIdx === null || dragIdx === targetIdx) {
        setDragIdx(null)
        setDropIdx(null)
        return
      }

      const order = pages.map((_, i) => i)
      const [moved] = order.splice(dragIdx, 1)
      order.splice(targetIdx, 0, moved)
      onReorder(order)
      setDragIdx(null)
      setDropIdx(null)
    },
    [dragIdx, pages, onReorder, onMerge],
  )

  const handleDragEnd = useCallback(() => {
    setDragIdx(null)
    setDropIdx(null)
  }, [])

  const handlePageClick = useCallback(
    (e: React.MouseEvent, idx: number) => {
      const multi = e.ctrlKey || e.metaKey
      const range = e.shiftKey

      if (range && lastClickedRef.current !== null) {
        const lo = Math.min(lastClickedRef.current, idx)
        const hi = Math.max(lastClickedRef.current, idx)
        setSelected((prev) => {
          const next = new Set(prev)
          for (let i = lo; i <= hi; i++) next.add(i)
          return next
        })
      } else if (multi) {
        setSelected((prev) => {
          const next = new Set(prev)
          if (next.has(idx)) next.delete(idx)
          else next.add(idx)
          return next
        })
      } else {
        setSelected(new Set())
        setCurrentPage(idx)
      }
      lastClickedRef.current = idx
    },
    [setCurrentPage],
  )

  const handleDropOnPanel = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      if (e.dataTransfer.files.length > 0) {
        onMerge(e.dataTransfer.files)
      }
      setDragIdx(null)
      setDropIdx(null)
    },
    [onMerge],
  )

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDropOnPanel}
    >
      {/* Panel toolbar */}
      <div className="border-border flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1">
        <button
          type="button"
          title="Insert blank page"
          aria-label="Insert blank page"
          onClick={() => onInsertBlank(currentPage + 1)}
          className="hover:bg-bg-hover text-fg-secondary rounded p-1"
        >
          <FilePlus className="size-3.5" />
        </button>
        <button
          type="button"
          title="Rotate current page 90°"
          aria-label="Rotate current page 90°"
          onClick={() => onRotate(currentPage)}
          className="hover:bg-bg-hover text-fg-secondary rounded p-1"
        >
          <RotateCw className="size-3.5" />
        </button>
        <button
          type="button"
          title="Delete current page"
          aria-label="Delete current page"
          onClick={() => onDelete(currentPage)}
          className="hover:bg-bg-hover text-fg-secondary rounded p-1"
        >
          <Trash2 className="size-3.5" />
        </button>
        {selected.size > 0 && (
          <button
            type="button"
            title={`Save ${selected.size} selected page${selected.size > 1 ? 's' : ''} as new PDF`}
            aria-label={`Save ${selected.size} selected pages as new PDF`}
            onClick={() => {
              const sorted = [...selected].sort((a, b) => a - b)
              onExtractPages(sorted)
              setSelected(new Set())
            }}
            className="hover:bg-bg-hover text-accent rounded p-1"
          >
            <Save className="size-3.5" />
          </button>
        )}
        <button
          type="button"
          title="Merge another PDF"
          aria-label="Merge another PDF"
          onClick={() => fileInputRef.current?.click()}
          className="hover:bg-bg-hover text-fg-secondary ml-auto rounded p-1"
        >
          <FileStack className="size-3.5" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          aria-label="Choose PDF to merge"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) onMerge(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {/* Thumbnail list */}
      <div className="flex-1 overflow-y-auto p-1.5">
        <div className="flex flex-col gap-2">
          {pages.map((page, i) => {
            const isSelected = selected.has(i)
            return (
              <button
                key={i}
                type="button"
                draggable
                aria-label={`Page ${i + 1}`}
                aria-current={i === currentPage ? 'page' : undefined}
                aria-selected={isSelected}
                onClick={(e) => handlePageClick(e, i)}
                onDragStart={(e) => handleDragStart(e, i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDrop={(e) => handleDrop(e, i)}
                onDragEnd={handleDragEnd}
                className={cn(
                  'relative rounded-lg border-2 p-0.5 transition-all',
                  isSelected
                    ? 'border-accent bg-accent/10 shadow-sm'
                    : i === currentPage
                      ? 'border-accent shadow-sm'
                      : 'border-transparent hover:border-border-strong',
                  dropIdx === i && dragIdx !== null && dragIdx !== i && 'border-accent border-dashed',
                  dragIdx === i && 'opacity-40',
                )}
              >
                <PageThumbnail page={page} index={i} />
                <span className={cn(
                  'absolute bottom-1 left-1/2 -translate-x-1/2 rounded px-1.5 py-0.5 text-[10px] font-medium',
                  isSelected ? 'bg-accent text-white' : 'bg-bg/80 text-fg-muted',
                )}>
                  {i + 1}
                </span>
              </button>
            )
          })}
        </div>

        {/* Drop zone at bottom for appending via merge */}
        <div
          role="region"
          aria-label="Drop PDF to merge at end of document"
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
          }}
          onDrop={(e) => {
            e.preventDefault()
            if (e.dataTransfer.files.length > 0) onMerge(e.dataTransfer.files)
          }}
          className="border-border-strong mt-2 flex items-center justify-center rounded-lg border-2 border-dashed py-3"
        >
          <span className="text-fg-muted text-[10px]">Drop PDF to merge</span>
        </div>
      </div>
    </div>
  )
}
