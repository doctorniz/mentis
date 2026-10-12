import type { PdfInkAnnotation } from '@/types/pdf'

/** Distance from point `p` to the segment `a`–`b`. */
function toSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/**
 * The ink annotations an eraser at `point` (page coordinates) touches: any
 * stroke passing within `reach` of it, allowing for the stroke's own width.
 */
export function inkTouched(
  inks: readonly PdfInkAnnotation[],
  point: { x: number; y: number },
  reach: number,
): PdfInkAnnotation[] {
  return inks.filter((ink) =>
    ink.paths.some((path) => {
      const within = reach + ink.strokeWidth / 2
      const pts = path.points
      if (pts.length === 1) return Math.hypot(point.x - pts[0]!.x, point.y - pts[0]!.y) <= within
      for (let i = 1; i < pts.length; i++) {
        if (toSegment(point, pts[i - 1]!, pts[i]!) <= within) return true
      }
      return false
    }),
  )
}
