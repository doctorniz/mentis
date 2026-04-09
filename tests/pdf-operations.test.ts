import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import {
  createBlankPdf,
  insertBlankPage,
  appendBlankPage,
  deletePage,
  rotatePage,
  reorderPages,
  mergePages,
  splitPages,
  flattenPdf,
  getFormFields,
  fillFormFields,
} from '@/lib/pdf/page-operations'

async function pageCount(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes)
  return doc.getPageCount()
}

async function makeSamplePdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) doc.addPage()
  return doc.save()
}

describe('createBlankPdf', () => {
  it('creates a single-page A4 PDF', async () => {
    const bytes = await createBlankPdf({ size: 'a4', style: 'blank' })
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(await pageCount(bytes)).toBe(1)
  })

  it('creates a letter-sized PDF', async () => {
    const bytes = await createBlankPdf({ size: 'letter', style: 'blank' })
    const doc = await PDFDocument.load(bytes)
    const page = doc.getPage(0)
    const { width } = page.getSize()
    expect(width).toBeCloseTo(612, 0)
  })

  it('creates a lined PDF without errors', async () => {
    const bytes = await createBlankPdf({ size: 'a4', style: 'lined' })
    expect(await pageCount(bytes)).toBe(1)
  })

  it('creates a grid PDF without errors', async () => {
    const bytes = await createBlankPdf({ size: 'a4', style: 'grid' })
    expect(await pageCount(bytes)).toBe(1)
  })

  it('creates a dot-grid PDF without errors', async () => {
    const bytes = await createBlankPdf({ size: 'a4', style: 'dot-grid' })
    expect(await pageCount(bytes)).toBe(1)
  })

  it('creates custom-size PDF', async () => {
    const bytes = await createBlankPdf({
      size: 'custom', style: 'blank', customWidth: 400, customHeight: 600,
    })
    const doc = await PDFDocument.load(bytes)
    const { width, height } = doc.getPage(0).getSize()
    expect(width).toBeCloseTo(400, 0)
    expect(height).toBeCloseTo(600, 0)
  })
})

describe('insertBlankPage', () => {
  it('inserts at beginning', async () => {
    const original = await makeSamplePdf(2)
    const result = await insertBlankPage(original, 0, { size: 'a4', style: 'blank' })
    expect(await pageCount(result)).toBe(3)
  })

  it('inserts at end', async () => {
    const original = await makeSamplePdf(1)
    const result = await insertBlankPage(original, 1, { size: 'a4', style: 'blank' })
    expect(await pageCount(result)).toBe(2)
  })
})

describe('appendBlankPage', () => {
  it('appends using file page count (not stale UI index)', async () => {
    let pdf = await makeSamplePdf(1)
    pdf = await appendBlankPage(pdf, { size: 'a4', style: 'blank' })
    expect(await pageCount(pdf)).toBe(2)
    pdf = await appendBlankPage(pdf, { size: 'a4', style: 'blank' })
    expect(await pageCount(pdf)).toBe(3)
  })
})

describe('deletePage', () => {
  it('removes a page', async () => {
    const original = await makeSamplePdf(3)
    const result = await deletePage(original, 1)
    expect(await pageCount(result)).toBe(2)
  })

  it('throws when deleting the only page', async () => {
    const original = await makeSamplePdf(1)
    await expect(deletePage(original, 0)).rejects.toThrow('Cannot delete the only page')
  })
})

describe('rotatePage', () => {
  it('rotates a page by 90 degrees', async () => {
    const original = await makeSamplePdf(1)
    const result = await rotatePage(original, 0, 90)
    const doc = await PDFDocument.load(result)
    expect(doc.getPage(0).getRotation().angle).toBe(90)
  })

  it('cumulative rotation', async () => {
    let pdf = await makeSamplePdf(1)
    pdf = await rotatePage(pdf, 0, 90)
    pdf = await rotatePage(pdf, 0, 90)
    const doc = await PDFDocument.load(pdf)
    expect(doc.getPage(0).getRotation().angle).toBe(180)
  })

  it('rotation wraps at 360', async () => {
    let pdf = await makeSamplePdf(1)
    pdf = await rotatePage(pdf, 0, 270)
    pdf = await rotatePage(pdf, 0, 180)
    const doc = await PDFDocument.load(pdf)
    expect(doc.getPage(0).getRotation().angle).toBe(90)
  })
})

describe('reorderPages', () => {
  it('reverses page order', async () => {
    const original = await makeSamplePdf(3)
    const result = await reorderPages(original, [2, 1, 0])
    expect(await pageCount(result)).toBe(3)
  })

  it('can duplicate pages via reorder', async () => {
    const original = await makeSamplePdf(2)
    const result = await reorderPages(original, [0, 0, 1, 1])
    expect(await pageCount(result)).toBe(4)
  })
})

describe('mergePages', () => {
  it('merges two PDFs', async () => {
    const a = await makeSamplePdf(2)
    const b = await makeSamplePdf(3)
    const merged = await mergePages(a, b)
    expect(await pageCount(merged)).toBe(5)
  })
})

describe('splitPages', () => {
  it('extracts a page range', async () => {
    const original = await makeSamplePdf(5)
    const extracted = await splitPages(original, 1, 3)
    expect(await pageCount(extracted)).toBe(3)
  })

  it('extracts a single page', async () => {
    const original = await makeSamplePdf(3)
    const extracted = await splitPages(original, 0, 0)
    expect(await pageCount(extracted)).toBe(1)
  })
})

async function makePdfWithForm(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.addPage()
  const form = doc.getForm()
  const tf = form.createTextField('name')
  tf.setText('Alice')
  tf.addToPage(doc.getPage(0)!, { x: 50, y: 700, width: 200, height: 20 })
  return doc.save()
}

describe('getFormFields', () => {
  it('returns empty array for PDFs with no AcroForm fields (P10)', async () => {
    const plain = await makeSamplePdf(1)
    const fields = await getFormFields(plain)
    expect(fields).toEqual([])
  })

  it('returns empty array instead of throwing on invalid bytes', async () => {
    const fields = await getFormFields(new Uint8Array([1, 2, 3, 4]))
    expect(fields).toEqual([])
  })
})

describe('flattenPdf', () => {
  it('returns valid PDF bytes', async () => {
    const original = await makePdfWithForm()
    const flat = await flattenPdf(original)
    expect(flat).toBeInstanceOf(Uint8Array)
    expect(flat.length).toBeGreaterThan(0)
    const doc = await PDFDocument.load(flat)
    expect(doc.getPageCount()).toBe(1)
  })

  it('removes form fields after flattening', async () => {
    const original = await makePdfWithForm()
    const fieldsBefore = await getFormFields(original)
    expect(fieldsBefore.length).toBeGreaterThan(0)

    const flat = await flattenPdf(original)
    const fieldsAfter = await getFormFields(flat)
    expect(fieldsAfter).toHaveLength(0)
  })

  it('works on a PDF with no form fields', async () => {
    const plain = await makeSamplePdf(2)
    const flat = await flattenPdf(plain)
    expect(flat).toBeInstanceOf(Uint8Array)
    expect(await pageCount(flat)).toBe(2)
  })
})

describe('fillFormFields + flatten', () => {
  it('fills and flattens in one step', async () => {
    const original = await makePdfWithForm()
    const filled = await fillFormFields(original, { name: 'Bob' }, true)
    const fields = await getFormFields(filled)
    expect(fields).toHaveLength(0)
  })
})
