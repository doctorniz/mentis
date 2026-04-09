import type { PDFPageProxy } from 'pdfjs-dist'
import type {
  PdfAnnotation,
  PdfHighlight,
  PdfInkAnnotation,
  PdfRect,
  PdfTextComment,
} from '@/types/pdf'
import { PdfAnnotationType } from '@/types/pdf'

function toRect(r: number[]): PdfRect {
  const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = r
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) }
}

function readStickyNoteContents(ann: {
  contentsObj?: { str?: string }
  contents?: string
}): string {
  const s = ann.contentsObj?.str
  if (typeof s === 'string' && s.trim()) return s
  const c = ann.contents
  if (typeof c === 'string' && c.trim()) return c
  return ''
}

/** Read `/Highlight`, `/Ink`, and `/Text` (sticky note) annotations via pdfjs. */
export async function readPageAnnotations(
  page: PDFPageProxy,
  pageIndex: number,
): Promise<PdfAnnotation[]> {
  const raw = await page.getAnnotations({ intent: 'display' })
  const out: PdfAnnotation[] = []
  const now = new Date().toISOString()

  for (const ann of raw) {
    const r = ann.rect as number[]
    const rect = toRect(r)

    if (ann.subtype === 'Highlight') {
      const qp: number[][] = []
      if (Array.isArray(ann.quadPoints)) {
        for (let i = 0; i < (ann.quadPoints as number[]).length; i += 8) {
          qp.push((ann.quadPoints as number[]).slice(i, i + 8))
        }
      }
      const h: PdfHighlight = {
        id: ann.id ?? crypto.randomUUID(),
        type: PdfAnnotationType.Highlight,
        pageIndex,
        rect,
        color: ann.color
          ? `rgba(${Math.round((ann.color as number[])[0]! * 255)},${Math.round((ann.color as number[])[1]! * 255)},${Math.round((ann.color as number[])[2]! * 255)},0.35)`
          : '#fff3bf',
        quadPoints: qp,
        createdAt: now,
        modifiedAt: now,
      }
      out.push(h)
    }

    if (ann.subtype === 'Ink') {
      const paths = (ann.inkLists as number[][] ?? []).map((list: number[]) => {
        const points: { x: number; y: number }[] = []
        for (let i = 0; i < list.length; i += 2) {
          points.push({ x: list[i]!, y: list[i + 1]! })
        }
        return { points }
      })
      const ink: PdfInkAnnotation = {
        id: ann.id ?? crypto.randomUUID(),
        type: PdfAnnotationType.Ink,
        pageIndex,
        rect,
        paths,
        strokeColor: ann.color
          ? `rgb(${Math.round((ann.color as number[])[0]! * 255)},${Math.round((ann.color as number[])[1]! * 255)},${Math.round((ann.color as number[])[2]! * 255)})`
          : '#000000',
        strokeWidth: (ann.borderStyle?.width as number) ?? 2,
        createdAt: now,
        modifiedAt: now,
      }
      out.push(ink)
    }

    if (ann.subtype === 'Text') {
      const text = readStickyNoteContents(ann)
      if (!text) continue
      const tc: PdfTextComment = {
        id: typeof ann.id === 'string' && ann.id ? ann.id : crypto.randomUUID(),
        type: PdfAnnotationType.Text,
        pageIndex,
        rect,
        text,
        createdAt: now,
        modifiedAt: now,
      }
      out.push(tc)
    }
  }
  return out
}
