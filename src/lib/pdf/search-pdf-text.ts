import type { PDFPageProxy } from 'pdfjs-dist'
import { loadPdfjs } from '@/lib/pdf/pdfjs-loader'

type PageTextItem = Awaited<ReturnType<PDFPageProxy['getTextContent']>>['items'][number]

type ExtractedTextItem = PageTextItem & {
  str: string
  width: number
  height: number
  transform: number[]
  hasEOL?: boolean
}

function isExtractedTextItem(item: PageTextItem): item is ExtractedTextItem {
  if (typeof item !== 'object' || item === null || !('str' in item)) return false
  const o = item as Record<string, unknown>
  return (
    typeof o.str === 'string' &&
    typeof o.width === 'number' &&
    typeof o.height === 'number' &&
    Array.isArray(o.transform)
  )
}

export type PdfTextSearchMatch = {
  pageIndex: number
  /** Viewport coordinates at the given zoom (same space as the annotation canvas). */
  rect: { x: number; y: number; width: number; height: number }
}

/** Build a flat string and per-character index into `items` (or -1 for synthetic newline). */
export function buildPageTextMap(items: PageTextItem[]): { text: string; charToItem: number[] } {
  let text = ''
  const charToItem: number[] = []
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    if (!isExtractedTextItem(it)) continue
    const str = it.str
    for (let j = 0; j < str.length; j++) {
      charToItem.push(i)
      text += str[j]
    }
    if ('hasEOL' in it && it.hasEOL) {
      text += '\n'
      charToItem.push(-1)
    }
  }
  return { text, charToItem }
}

export function findAllMatchStartIndices(text: string, needle: string, caseSensitive: boolean): number[] {
  if (!needle) return []
  const h = caseSensitive ? text : text.toLowerCase()
  const n = caseSensitive ? needle : needle.toLowerCase()
  const out: number[] = []
  let pos = 0
  while (pos <= h.length - n.length) {
    const idx = h.indexOf(n, pos)
    if (idx === -1) break
    out.push(idx)
    pos = idx + n.length
  }
  return out
}

function collectItemIndicesForRange(
  charToItem: number[],
  start: number,
  len: number,
): Set<number> | null {
  const set = new Set<number>()
  for (let k = 0; k < len; k++) {
    const idx = charToItem[start + k]
    if (idx === undefined) return null
    if (idx >= 0) set.add(idx)
  }
  return set.size ? set : null
}

function textItemPdfBBox(item: ExtractedTextItem, applyTransform: (p: number[], m: number[]) => number[]): [
  number,
  number,
  number,
  number,
] {
  const m = item.transform
  const w = item.width
  const h = item.height
  const corners = [
    applyTransform([0, 0], m) as [number, number],
    applyTransform([w, 0], m) as [number, number],
    applyTransform([w, h], m) as [number, number],
    applyTransform([0, h], m) as [number, number],
  ]
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of corners) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return [minX, minY, maxX, maxY]
}

function unionPdfBBoxes(boxes: [number, number, number, number][]): [number, number, number, number] {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [a, b, c, d] of boxes) {
    minX = Math.min(minX, a, c)
    minY = Math.min(minY, b, d)
    maxX = Math.max(maxX, a, c)
    maxY = Math.max(maxY, b, d)
  }
  return [minX, minY, maxX, maxY]
}

function viewportRectFromPdfBBox(
  viewport: ReturnType<PDFPageProxy['getViewport']>,
  pdf: [number, number, number, number],
) {
  const [vx1, vy1, vx2, vy2] = viewport.convertToViewportRectangle(pdf)
  const x = Math.min(vx1, vx2)
  const y = Math.min(vy1, vy2)
  return { x, y, width: Math.abs(vx2 - vx1), height: Math.abs(vy2 - vy1) }
}

/**
 * Search extractable text on all pages. Case-insensitive; literal substring (not regex).
 */
export async function searchPdfDocument(
  pages: PDFPageProxy[],
  query: string,
  zoom: number,
): Promise<PdfTextSearchMatch[]> {
  const needle = query.trim()
  if (!needle || pages.length === 0) return []

  const pdfjs = await loadPdfjs()
  const applyTransform = pdfjs.Util.applyTransform.bind(pdfjs.Util)
  const results: PdfTextSearchMatch[] = []

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex]!
    const tc = await page.getTextContent()
    const { text, charToItem } = buildPageTextMap(tc.items)
    const starts = findAllMatchStartIndices(text, needle, false)
    const viewport = page.getViewport({ scale: zoom })

    for (const start of starts) {
      if (start + needle.length > text.length) continue
      const itemIdxSet = collectItemIndicesForRange(charToItem, start, needle.length)
      if (!itemIdxSet) continue
      const boxes: [number, number, number, number][] = []
      for (const ii of itemIdxSet) {
        const item = tc.items[ii]
        if (!isExtractedTextItem(item)) continue
        boxes.push(textItemPdfBBox(item, applyTransform))
      }
      if (boxes.length === 0) continue
      const unionPdf = unionPdfBBoxes(boxes)
      const rect = viewportRectFromPdfBBox(viewport, unionPdf)
      if (rect.width > 0.5 && rect.height > 0.5) {
        results.push({ pageIndex, rect })
      }
    }
  }

  return results
}
