'use client'

import { useEffect, useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'

interface OutlineNode {
  title: string
  dest: unknown
  items: OutlineNode[]
}

/**
 * Standalone outline tree content — no column shell or collapse chrome.
 * Designed to be embedded inside PdfSideColumn.
 */
export function PdfOutlineContent({
  pdfDoc,
  onNavigate,
}: {
  pdfDoc: import('pdfjs-dist').PDFDocumentProxy | null
  onNavigate: (pageIndex: number) => void
}) {
  const [outline, setOutline] = useState<OutlineNode[]>([])

  useEffect(() => {
    if (!pdfDoc) {
      setOutline([])
      return
    }
    let cancelled = false
    void pdfDoc.getOutline().then((o) => {
      if (!cancelled && o) setOutline(o as OutlineNode[])
    })
    return () => {
      cancelled = true
    }
  }, [pdfDoc])

  async function resolveDest(dest: unknown): Promise<number | null> {
    if (!pdfDoc) return null
    try {
      let ref: unknown
      if (typeof dest === 'string') {
        ref = await pdfDoc.getDestination(dest)
      } else {
        ref = dest
      }
      if (Array.isArray(ref) && ref[0]) {
        const idx = await pdfDoc.getPageIndex(ref[0])
        return idx
      }
    } catch {
      /* noop */
    }
    return null
  }

  if (outline.length === 0) {
    return <p className="text-fg-muted px-2 py-3 text-xs">No outline.</p>
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1" role="tree" aria-label="PDF document outline">
      {outline.map((node, i) => (
        <OutlineItem
          key={i}
          node={node}
          depth={0}
          resolveDest={resolveDest}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  )
}

function OutlineItem({
  node,
  depth,
  resolveDest,
  onNavigate,
}: {
  node: OutlineNode
  depth: number
  resolveDest: (dest: unknown) => Promise<number | null>
  onNavigate: (pageIndex: number) => void
}) {
  const [expanded, setExpanded] = useState(depth < 1)
  const hasChildren = node.items && node.items.length > 0

  return (
    <div role="treeitem" aria-expanded={hasChildren ? expanded : undefined}>
      <div
        className="hover:bg-bg-hover text-fg flex w-full items-center gap-1 rounded px-1 py-1 text-left text-xs"
        style={{ paddingLeft: 4 + depth * 12 }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="shrink-0 p-0.5"
            aria-label={expanded ? `Collapse ${node.title}` : `Expand ${node.title}`}
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(!expanded)
            }}
          >
            {expanded ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <button
          type="button"
          className="min-w-0 truncate text-left"
          onClick={async () => {
            const idx = await resolveDest(node.dest)
            if (idx !== null) onNavigate(idx)
          }}
        >
          {node.title}
        </button>
      </div>
      {expanded && hasChildren && (
        <div role="group">
          {node.items.map((child, i) => (
            <OutlineItem
              key={i}
              node={child}
              depth={depth + 1}
              resolveDest={resolveDest}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  )
}
