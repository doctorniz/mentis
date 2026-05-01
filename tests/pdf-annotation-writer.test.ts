import { describe, it, expect } from 'vitest'
import { PDFDocument, PDFDict, PDFName } from 'pdf-lib'
import { writeAnnotationsIntoPdf } from '@/lib/pdf/annotation-writer'
import { fabricPathCommandsToPdfPoints } from '@/lib/pdf/fabric-path-to-pdf-points'
import { createBlankPdf } from '@/lib/pdf/page-operations'
import { PdfAnnotationType, type PdfTextComment, type PdfInkAnnotation } from '@/types/pdf'

function ts() {
  return new Date().toISOString()
}

function textAnnotContents(dict: PDFDict): string {
  const raw = dict.get(PDFName.of('Contents'))
  if (raw && typeof (raw as { decodeText?: () => string }).decodeText === 'function') {
    return (raw as unknown as { decodeText: () => string }).decodeText()
  }
  return ''
}

describe('writeAnnotationsIntoPdf', () => {
  it('writes a native /Text annotation with Contents and InkMarrow', async () => {
    const blank = await createBlankPdf({ size: 'a4', style: 'blank' })
    const now = ts()
    const out = await writeAnnotationsIntoPdf(blank, [
      {
        id: 'comment-1',
        type: PdfAnnotationType.Text,
        pageIndex: 0,
        rect: { x: 72, y: 120, width: 200, height: 48 },
        text: 'Sticky note body',
        createdAt: now,
        modifiedAt: now,
      } as PdfTextComment,
    ])

    const doc = await PDFDocument.load(out)
    const page = doc.getPage(0)
    const annots = page.node.Annots()
    expect(annots?.size()).toBe(1)

    const dict = doc.context.lookup(annots!.get(0), PDFDict)
    expect(dict.get(PDFName.of('Subtype'))).toEqual(PDFName.of('Text'))
    expect(textAnnotContents(dict)).toBe('Sticky note body')
    expect(dict.get(PDFName.of('InkMarrow'))?.toString()).toBe('true')
  })

  it('strips prior InkMarrow /Text before rewrite so a second save does not duplicate', async () => {
    const blank = await createBlankPdf({ size: 'a4', style: 'blank' })
    const now = ts()
    const base = {
      id: 'same-id',
      type: PdfAnnotationType.Text as const,
      pageIndex: 0,
      rect: { x: 50, y: 80, width: 160, height: 40 },
      createdAt: now,
      modifiedAt: now,
    }

    const pass1 = await writeAnnotationsIntoPdf(blank, [{ ...base, text: 'First' } as PdfTextComment])
    const pass2 = await writeAnnotationsIntoPdf(pass1, [{ ...base, text: 'Second' } as PdfTextComment])

    const doc = await PDFDocument.load(pass2)
    const annots = doc.getPage(0).node.Annots()
    expect(annots?.size()).toBe(1)
    const dict = doc.context.lookup(annots!.get(0), PDFDict)
    expect(textAnnotContents(dict)).toBe('Second')
  })

  it('writes ink strokes from quadratic path segments (Fabric-style)', async () => {
    const blank = await createBlankPdf({ size: 'a4', style: 'blank' })
    const now = ts()
    const zoom = 1
    const fabricLike: (string | number)[][] = [
      ['M', 72, 100],
      ['Q', 120, 80, 200, 120],
    ]
    const pts = fabricPathCommandsToPdfPoints(fabricLike, zoom)
    expect(pts.length).toBeGreaterThanOrEqual(2)

    const out = await writeAnnotationsIntoPdf(blank, [
      {
        id: 'ink-1',
        type: PdfAnnotationType.Ink,
        pageIndex: 0,
        rect: { x: 50, y: 50, width: 200, height: 100 },
        paths: [{ points: pts }],
        strokeColor: '#000000',
        strokeWidth: 2,
        createdAt: now,
        modifiedAt: now,
      } as PdfInkAnnotation,
    ])

    const reloaded = await PDFDocument.load(out)
    expect(reloaded.getPageCount()).toBe(1)
  })
})
