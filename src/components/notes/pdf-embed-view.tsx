'use client'

import { useEffect, useRef, useState } from 'react'
import type { FileSystemAdapter } from '@/lib/fs'
import { loadPdfjs } from '@/lib/pdf/pdfjs-loader'
import { cn } from '@/utils/cn'

const RENDER_WIDTH = 600

function parsePageSpec(spec: string): number[] {
  const range = spec.match(/^(\d+)-(\d+)$/)
  if (range) {
    const start = parseInt(range[1]!, 10)
    const end = parseInt(range[2]!, 10)
    const pages: number[] = []
    for (let i = start; i <= end && i <= start + 20; i++) pages.push(i)
    return pages
  }
  const single = parseInt(spec, 10)
  return isNaN(single) ? [1] : [single]
}

export function PdfEmbedView({
  file,
  page,
  vaultFs,
}: {
  file: string
  page: string
  vaultFs: FileSystemAdapter
}) {
  const pages = parsePageSpec(page)
  return (
    <div className="border-border bg-bg-hover my-2 overflow-hidden rounded-lg border">
      <div className="text-fg-muted border-border flex items-center gap-2 border-b px-3 py-1.5 text-xs">
        <span className="font-medium">{file}</span>
        <span>
          {pages.length === 1
            ? `page ${pages[0]}`
            : `pages ${pages[0]}–${pages[pages.length - 1]}`}
        </span>
      </div>
      <div className="flex flex-col items-center gap-2 p-2">
        {pages.map((p) => (
          <PdfPageCanvas key={p} file={file} pageNum={p} vaultFs={vaultFs} />
        ))}
      </div>
    </div>
  )
}

function PdfPageCanvas({
  file,
  pageNum,
  vaultFs,
}: {
  file: string
  pageNum: number
  vaultFs: FileSystemAdapter
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const pdfjs = await loadPdfjs()
        const data = await vaultFs.readFile(file)
        const doc = await pdfjs.getDocument({ data }).promise
        if (cancelled) return
        if (pageNum < 1 || pageNum > doc.numPages) {
          setError(`Page ${pageNum} out of range (1–${doc.numPages})`)
          setLoading(false)
          return
        }
        const pdfPage = await doc.getPage(pageNum)
        if (cancelled) return
        const vp = pdfPage.getViewport({ scale: 1 })
        const scale = RENDER_WIDTH / vp.width
        const viewport = pdfPage.getViewport({ scale })

        const canvas = canvasRef.current
        if (!canvas || cancelled) return
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        const ctx = canvas.getContext('2d')!
        await pdfPage.render({ canvasContext: ctx, viewport }).promise
        if (!cancelled) setLoading(false)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to render PDF page')
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [file, pageNum, vaultFs])

  if (error) {
    return (
      <div className="text-danger px-3 py-2 text-xs">
        {error}
      </div>
    )
  }

  return (
    <div className="relative">
      {loading && (
        <div className="text-fg-muted absolute inset-0 flex items-center justify-center text-xs">
          Rendering page {pageNum}…
        </div>
      )}
      <canvas
        ref={canvasRef}
        aria-label={`Embedded PDF page ${pageNum}`}
        className={cn('max-w-full rounded', loading && 'invisible')}
      />
    </div>
  )
}
