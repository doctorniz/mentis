'use client'

import type { PdfTextComment } from '@/types/pdf'

const MIN_CARD_GAP = 8
/** Minimum vertical slot per card when stacking overlapping anchors. */
const CARD_SLOT = 52

function stackTops(sorted: PdfTextComment[], zoom: number): number[] {
  const raw = sorted.map((c) => c.rect.y * zoom)
  const out: number[] = []
  let prevBottom = -Infinity
  for (const top of raw) {
    const t = Math.max(top, prevBottom + MIN_CARD_GAP)
    out.push(t)
    prevBottom = t + CARD_SLOT
  }
  return out
}

export function PdfPageCommentRail({
  comments,
  railHeightPx,
  zoom,
}: {
  comments: PdfTextComment[]
  railHeightPx: number
  zoom: number
}) {
  if (comments.length === 0) return null

  const sorted = [...comments].sort((a, b) => a.rect.y - b.rect.y)
  const tops = stackTops(sorted, zoom)

  return (
    <div
      className="border-border/80 bg-bg-secondary/40 relative w-full max-w-[min(100%,240px)] shrink-0 border-t border-dashed pt-2 sm:w-[min(100%,220px)] sm:border-t-0 sm:border-l sm:pt-0 sm:pl-3"
      style={{ minHeight: railHeightPx }}
      aria-label="Comments for this page"
    >
      <div className="text-fg-muted absolute top-0 right-0 left-3 border-b border-transparent py-1 text-[10px] font-medium tracking-wide uppercase">
        Comments
      </div>
      <div className="relative pt-7" style={{ minHeight: Math.max(0, railHeightPx - 28) }}>
        {sorted.map((c, i) => {
          const top = tops[i] ?? c.rect.y * zoom
          return (
            <div
              key={c.id}
              className="border-border bg-[#fff9db] absolute right-0 left-0 rounded-md border border-[#fab005]/35 shadow-sm"
              style={{
                top,
                maxWidth: '100%',
              }}
            >
              <div className="absolute top-2 -left-2 h-px w-2 bg-[#fab005]/60" aria-hidden />
              <p className="text-fg max-h-32 overflow-y-auto px-2.5 py-2 text-xs leading-snug whitespace-pre-wrap">
                {c.text}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
