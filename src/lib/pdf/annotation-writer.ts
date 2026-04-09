import {
  PDFDocument,
  PDFBool,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFPage,
  PDFString,
  rgb,
} from 'pdf-lib'
import type {
  PdfAnnotation,
  PdfHighlight,
  PdfInkAnnotation,
  PdfFreeText,
  PdfStamp,
  PdfTextComment,
} from '@/types/pdf'
import { PdfAnnotationType } from '@/types/pdf'

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] ?? ''
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const SUBTYPE_TEXT = PDFName.of('Text')

function stripInkMarrowTextAnnots(page: PDFPage, doc: PDFDocument): void {
  const annots = page.node.Annots()
  if (!annots) return
  const ctx = doc.context
  const SUBTYPE = PDFName.of('Subtype')
  const MARK = PDFName.of('InkMarrow')
  for (let i = annots.size() - 1; i >= 0; i--) {
    const entry = annots.get(i)
    const dict = ctx.lookup(entry, PDFDict)
    if (!(dict instanceof PDFDict)) continue
    if (dict.get(SUBTYPE) !== SUBTYPE_TEXT) continue
    if (dict.get(MARK) === PDFBool.True) annots.remove(i)
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(hex)
  if (m) return [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255]
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/**
 * Write annotations into the PDF bytes (pdf-lib).
 * Highlights, ink, and FreeText are **drawn** into page content. Stamps embed images.
 * Text comments use **native** `/Text` annotations (`Contents`, optional `NM`) plus a
 * custom `InkMarrow` flag so saves can strip prior app-owned notes before re-adding
 * (avoids duplicate sticky notes). pdf.js returns `/Text` via `getAnnotations` for reload.
 * After save, the viewer reloads so raster + native layers stay in sync (`PdfViewer`).
 */
export async function writeAnnotationsIntoPdf(
  pdfBytes: Uint8Array,
  annotations: PdfAnnotation[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  const pages = doc.getPages()

  for (const page of pages) {
    stripInkMarrowTextAnnots(page, doc)
  }

  for (const ann of annotations) {
    const page = pages[ann.pageIndex]
    if (!page) continue
    const { height: ph } = page.getSize()

    if (ann.type === PdfAnnotationType.Highlight) {
      const h = ann as PdfHighlight
      const [r, g, b] = hexToRgb(h.color ?? '#fff3bf')
      page.drawRectangle({
        x: h.rect.x,
        y: ph - h.rect.y - h.rect.height,
        width: h.rect.width,
        height: h.rect.height,
        color: rgb(r, g, b),
        opacity: 0.35,
      })
    }

    if (ann.type === PdfAnnotationType.Ink) {
      const ink = ann as PdfInkAnnotation
      const [r, g, b] = hexToRgb(ink.strokeColor)
      for (const path of ink.paths) {
        if (path.points.length < 2) continue
        for (let i = 1; i < path.points.length; i++) {
          const p0 = path.points[i - 1]!
          const p1 = path.points[i]!
          page.drawLine({
            start: { x: p0.x, y: ph - p0.y },
            end: { x: p1.x, y: ph - p1.y },
            thickness: ink.strokeWidth,
            color: rgb(r, g, b),
          })
        }
      }
    }

    if (ann.type === PdfAnnotationType.FreeText) {
      const ft = ann as PdfFreeText
      const [r, g, b] = hexToRgb(ft.fontColor)
      page.drawText(ft.text, {
        x: ft.rect.x,
        y: ph - ft.rect.y - ft.fontSize,
        size: ft.fontSize,
        color: rgb(r, g, b),
      })
    }

    if (ann.type === PdfAnnotationType.Text) {
      const tc = ann as PdfTextComment
      const llx = tc.rect.x
      const lly = ph - tc.rect.y - tc.rect.height
      const urx = tc.rect.x + tc.rect.width
      const ury = ph - tc.rect.y
      const annotDict = doc.context.obj({
        Type: PDFName.of('Annot'),
        Subtype: SUBTYPE_TEXT,
        Rect: [llx, lly, urx, ury],
        Contents: PDFHexString.fromText(tc.text),
        NM: PDFString.of(tc.id),
        Open: false,
        InkMarrow: true,
      })
      const ref = doc.context.register(annotDict)
      page.node.addAnnot(ref)
    }

    if (ann.type === PdfAnnotationType.Stamp) {
      const st = ann as PdfStamp
      try {
        const imgBytes = dataUrlToUint8Array(st.imageData)
        const isPng = st.imageData.startsWith('data:image/png')
        const img = isPng
          ? await doc.embedPng(imgBytes)
          : await doc.embedJpg(imgBytes)
        page.drawImage(img, {
          x: st.rect.x,
          y: ph - st.rect.y - st.rect.height,
          width: st.rect.width,
          height: st.rect.height,
        })
      } catch {
        /* stamp image could not be embedded — skip */
      }
    }
  }

  return doc.save()
}
