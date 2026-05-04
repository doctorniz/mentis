'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { Button } from '@/components/ui/button'
import { toast } from '@/stores/toast'

/**
 * Lightweight read-only PPTX viewer for compact / narrow viewports.
 *
 * Parses the file via SlideCanvas's headless `PptxParser` and renders
 * every slide as a card in a vertical scroll container. Text elements
 * are positioned HTML within a CSS-scaled wrapper per slide.
 * No ribbon, no slide reel column, no Fabric.js canvas.
 */

// Fallback 16:9 slide dimensions (used until we know the real layout).
const DEFAULT_W = 1280
const DEFAULT_H = 720

// PptxParser returns element coords in pixels; the layout field is in EMU.
// 914400 EMU = 1 inch = 96 px  →  1 px = 9525 EMU
const EMU_PER_PX = 9525

interface SlideElement {
  id: string
  type: string
  // Text
  content?: string
  fontSize?: number
  color?: string
  fontWeight?: string
  fontFamily?: string
  textAlign?: string
  isBold?: boolean
  isItalic?: boolean
  isUnderline?: boolean
  isStrikethrough?: boolean
  highlightColor?: string
  // Image
  src?: string
  // Shape
  shapeType?: string
  fill?: string
  stroke?: string
  strokeWidth?: number
  // Common
  x: number
  y: number
  width: number
  height: number
  zIndex?: number
  opacity?: number
}

interface Slide {
  id: string
  elements: SlideElement[]
}

interface Presentation {
  slides: Slide[]
  layout?: { width: number; height: number }
}

export function PptxCompactViewer({
  path,
}: {
  path: string
}) {
  const { vaultFs } = useVaultSession()
  const [presentation, setPresentation] = useState<Presentation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [containerW, setContainerW] = useState(0)

  // ---- Load + parse ----
  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const [bytes, mod] = await Promise.all([
          vaultFs.readFile(path),
          import('slidecanvas'),
        ])
        if (cancelled) return

        const buffer = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer

        const parser = new mod.PptxParser()
        const pres: Presentation = await parser.parse(buffer)
        if (cancelled) return

        setPresentation(pres)
        setLoading(false)
      } catch (e) {
        console.error('PPTX compact viewer load failed', e)
        if (!cancelled) {
          setError('Failed to load presentation.')
          setLoading(false)
        }
      }
    }

    void load()
    return () => { cancelled = true }
  }, [path, vaultFs])

  // Derive pixel dimensions from the EMU layout (or fall back to 1280×720).
  const slideW = presentation?.layout?.width
    ? presentation.layout.width / EMU_PER_PX
    : DEFAULT_W
  const slideH = presentation?.layout?.height
    ? presentation.layout.height / EMU_PER_PX
    : DEFAULT_H

  // ---- Track container width for scaling ----
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerW(entry.contentRect.width)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Scale each slide card to fill the container width (with padding).
  const pad = 32
  const scale = containerW > 0 ? (containerW - pad) / slideW : 1

  const total = presentation?.slides.length ?? 0

  // ---- Download ----
  const handleDownload = useCallback(async () => {
    try {
      const bytes = await vaultFs.readFile(path)
      const blob = new Blob(
        [bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer],
        { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
      )
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = path.split('/').pop() ?? 'presentation.pptx'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to download file')
    }
  }, [vaultFs, path])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Top bar — slide count + download */}
      <div className="border-border bg-bg-secondary flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
        <span className="text-fg font-mono text-xs font-medium">
          {path.split('/').pop()?.replace(/\.pptx$/i, '')}
        </span>
        <span className="text-fg-muted font-mono text-xs">.pptx</span>
        <span className="text-fg-muted ml-auto text-xs">
          {total > 0 ? `${total} slide${total !== 1 ? 's' : ''}` : ''}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="size-7 p-0"
          onClick={() => void handleDownload()}
          aria-label="Download PPTX"
          title="Download"
        >
          <Download className="size-3.5" />
        </Button>
      </div>

      {/* Alpha disclaimer */}
      <div className="bg-amber-50 dark:bg-amber-950/40 border-border shrink-0 border-b px-3 py-1">
        <p className="text-amber-700 dark:text-amber-400 text-center text-xs">
          Compact presentation viewer is in alpha — some slides may not render correctly.
        </p>
      </div>

      {/* Scrollable slide list */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto bg-neutral-100 dark:bg-neutral-900"
      >
        {loading && (
          <div className="flex h-full items-center justify-center">
            <span className="text-fg-muted text-sm">Loading…</span>
          </div>
        )}

        {error && (
          <div className="flex h-full items-center justify-center">
            <span className="text-danger text-sm">{error}</span>
          </div>
        )}

        {!loading && !error && presentation && total > 0 && (
          <div className="flex flex-col items-center gap-4 p-4">
            {presentation.slides.map((slide, i) => (
              <div key={slide.id} className="flex w-full flex-col items-center">
                {/* Slide number label */}
                <p className="text-fg-muted mb-1 self-start text-xs font-medium">{i + 1}</p>

                {/* Slide card */}
                <div
                  className="relative overflow-hidden rounded-lg bg-white shadow-lg dark:bg-neutral-800"
                  style={{
                    width: slideW * scale,
                    height: slideH * scale,
                  }}
                >
                  <div
                    style={{
                      width: slideW,
                      height: slideH,
                      transform: `scale(${scale})`,
                      transformOrigin: 'top left',
                    }}
                  >
                    {[...slide.elements]
                      .filter((el) =>
                        (el.type === 'text' && el.content?.trim()) ||
                        (el.type === 'image' && el.src) ||
                        (el.type === 'shape'),
                      )
                      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
                      .map((el) => {
                        const base: React.CSSProperties = {
                          left: el.x,
                          top: el.y,
                          width: el.width,
                          height: el.height,
                          zIndex: el.zIndex ?? 'auto',
                          opacity: el.opacity ?? 1,
                        }

                        if (el.type === 'image') {
                          return (
                            <img
                              key={el.id}
                              src={el.src}
                              alt=""
                              className="absolute"
                              draggable={false}
                              style={{ ...base, objectFit: 'fill' }}
                            />
                          )
                        }

                        if (el.type === 'shape') {
                          return (
                            <div
                              key={el.id}
                              className="absolute"
                              style={{
                                ...base,
                                backgroundColor: el.fill || 'transparent',
                                border: el.stroke
                                  ? `${el.strokeWidth ?? 1}px solid ${el.stroke}`
                                  : undefined,
                                borderRadius: el.shapeType === 'ellipse' ? '50%' : undefined,
                              }}
                            />
                          )
                        }

                        // Text element
                        return (
                          <div
                            key={el.id}
                            className="absolute overflow-hidden"
                            style={{
                              ...base,
                              fontSize: el.fontSize ? Math.max(10, el.fontSize * 0.75) : 14,
                              color: el.color || 'inherit',
                              fontWeight: el.isBold ? 'bold' : (el.fontWeight || 'normal'),
                              fontStyle: el.isItalic ? 'italic' : undefined,
                              textDecoration: [
                                el.isUnderline && 'underline',
                                el.isStrikethrough && 'line-through',
                              ].filter(Boolean).join(' ') || undefined,
                              backgroundColor: el.highlightColor || undefined,
                              fontFamily: el.fontFamily || 'sans-serif',
                              textAlign: (el.textAlign as React.CSSProperties['textAlign']) || 'left',
                              lineHeight: 1.3,
                            }}
                          >
                            {el.content}
                          </div>
                        )
                      })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && !error && presentation && total === 0 && (
          <div className="flex h-full items-center justify-center">
            <span className="text-fg-muted text-sm">This presentation has no slides.</span>
          </div>
        )}
      </div>
    </div>
  )
}
