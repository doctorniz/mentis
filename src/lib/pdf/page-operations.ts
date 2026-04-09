import { PDFDocument, rgb, degrees } from 'pdf-lib'
import type { PdfNewPageOptions } from '@/types/pdf'

const PAGE_SIZES = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
} as const

function pageDimensions(opts: PdfNewPageOptions): [number, number] {
  if (opts.size === 'custom' && opts.customWidth && opts.customHeight) {
    return [opts.customWidth, opts.customHeight]
  }
  const s = PAGE_SIZES[opts.size === 'custom' ? 'a4' : opts.size]
  return [s.width, s.height]
}

function drawPageStyle(
  page: ReturnType<PDFDocument['addPage']>,
  style: PdfNewPageOptions['style'],
  w: number,
  h: number,
) {
  const lineColor = rgb(0.85, 0.85, 0.85)
  const margin = 50
  const spacing = style === 'lined' ? 24 : 15

  if (style === 'lined') {
    page.drawLine({
      start: { x: margin + 20, y: h - margin },
      end: { x: margin + 20, y: margin },
      thickness: 0.5,
      color: rgb(0.9, 0.6, 0.6),
    })
    for (let y = h - margin - spacing; y > margin; y -= spacing) {
      page.drawLine({
        start: { x: margin, y },
        end: { x: w - margin, y },
        thickness: 0.3,
        color: lineColor,
      })
    }
  } else if (style === 'grid') {
    for (let y = margin; y <= h - margin; y += spacing) {
      page.drawLine({
        start: { x: margin, y },
        end: { x: w - margin, y },
        thickness: 0.2,
        color: lineColor,
      })
    }
    for (let x = margin; x <= w - margin; x += spacing) {
      page.drawLine({
        start: { x, y: margin },
        end: { x, y: h - margin },
        thickness: 0.2,
        color: lineColor,
      })
    }
  } else if (style === 'dot-grid') {
    for (let y = margin; y <= h - margin; y += spacing) {
      for (let x = margin; x <= w - margin; x += spacing) {
        page.drawCircle({ x, y, size: 0.8, color: lineColor })
      }
    }
  }
}

/** Create a standalone blank PDF with the given page style. */
export async function createBlankPdf(options: PdfNewPageOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const [w, h] = pageDimensions(options)
  const page = doc.addPage([w, h])
  if (options.style !== 'blank') drawPageStyle(page, options.style, w, h)
  return doc.save()
}

/** Mutates `doc`: insert a blank styled page at `index` (0-based). */
function insertBlankPageAt(doc: PDFDocument, index: number, opts: PdfNewPageOptions): void {
  const [w, h] = pageDimensions(opts)
  const page = doc.insertPage(index, [w, h])
  drawPageStyle(page, opts.style, w, h)
}

/** Insert a blank page at `index` (0-based). Returns new PDF bytes. */
export async function insertBlankPage(
  pdfBytes: Uint8Array,
  index: number,
  opts: PdfNewPageOptions,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  insertBlankPageAt(doc, index, opts)
  return doc.save()
}

/**
 * Append a blank page after the last page, using the **current** page count from the file bytes.
 * Prefer this over `insertBlankPage(bytes, pages.length)` when UI state may lag disk (e.g. double
 * “Add page” before reload).
 */
export async function appendBlankPage(
  pdfBytes: Uint8Array,
  opts: PdfNewPageOptions,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  insertBlankPageAt(doc, doc.getPageCount(), opts)
  return doc.save()
}

/** Delete page at `index` (0-based). Returns new PDF bytes. */
export async function deletePage(
  pdfBytes: Uint8Array,
  index: number,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  if (doc.getPageCount() <= 1) throw new Error('Cannot delete the only page')
  doc.removePage(index)
  return doc.save()
}

/** Rotate page at `index` by `angle` degrees (cumulative). Returns new PDF bytes. */
export async function rotatePage(
  pdfBytes: Uint8Array,
  index: number,
  angle: 90 | 180 | 270,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  const page = doc.getPage(index)
  const current = page.getRotation().angle
  page.setRotation(degrees((current + angle) % 360))
  return doc.save()
}

/** Reorder pages. `newOrder` is an array of old indices in the new order. */
export async function reorderPages(
  pdfBytes: Uint8Array,
  newOrder: number[],
): Promise<Uint8Array> {
  const src = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  const dst = await PDFDocument.create()

  for (const srcIdx of newOrder) {
    const [copied] = await dst.copyPages(src, [srcIdx])
    dst.addPage(copied)
  }

  return dst.save()
}

/** Append all pages from `otherPdfBytes` to the end of `basePdfBytes`. */
export async function mergePages(
  basePdfBytes: Uint8Array,
  otherPdfBytes: Uint8Array,
): Promise<Uint8Array> {
  const base = await PDFDocument.load(basePdfBytes, { ignoreEncryption: true })
  const other = await PDFDocument.load(otherPdfBytes, { ignoreEncryption: true })
  const indices = Array.from({ length: other.getPageCount() }, (_, i) => i)
  const copied = await base.copyPages(other, indices)
  for (const page of copied) base.addPage(page)
  return base.save()
}

/** Extract pages from `startIndex` to `endIndex` (inclusive, 0-based) into a new PDF. */
export async function splitPages(
  pdfBytes: Uint8Array,
  startIndex: number,
  endIndex: number,
): Promise<Uint8Array> {
  const src = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  const dst = await PDFDocument.create()
  const indices = Array.from({ length: endIndex - startIndex + 1 }, (_, i) => startIndex + i)
  const copied = await dst.copyPages(src, indices)
  for (const page of copied) dst.addPage(page)
  return dst.save()
}

/** Extract arbitrary pages (0-based indices, any order) into a new PDF. */
export async function extractPages(
  pdfBytes: Uint8Array,
  pageIndices: number[],
): Promise<Uint8Array> {
  const src = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  const dst = await PDFDocument.create()
  const copied = await dst.copyPages(src, pageIndices)
  for (const page of copied) dst.addPage(page)
  return dst.save()
}

/** Extract form field names + values from a PDF. Returns entries of [fieldName, value]. */
export async function getFormFields(
  pdfBytes: Uint8Array,
): Promise<Array<{ name: string; type: string; value: string }>> {
  try {
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
    const form = doc.getForm()
    const fields = form.getFields()

    return fields.map((field) => {
      const name = field.getName()
      const typeName = field.constructor.name
      let value = ''

      try {
        if ('getText' in field && typeof field.getText === 'function') {
          value = (field.getText() as string) ?? ''
        } else if ('getSelected' in field && typeof field.getSelected === 'function') {
          value = ((field.getSelected() as string[]) ?? []).join(', ')
        } else if ('isChecked' in field && typeof field.isChecked === 'function') {
          value = (field.isChecked() as boolean) ? 'checked' : 'unchecked'
        }
      } catch {
        /* read-only or unsupported */
      }

      return { name, type: typeName, value }
    })
  } catch {
    /* Missing/broken AcroForm, XFA-only, or load quirks — treat as no fields (P10). */
    return []
  }
}

/** Set form field values and flatten. Returns new PDF bytes. */
export async function fillFormFields(
  pdfBytes: Uint8Array,
  values: Record<string, string>,
  flatten = false,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  const form = doc.getForm()

  for (const [name, val] of Object.entries(values)) {
    try {
      const field = form.getField(name)
      if ('setText' in field && typeof field.setText === 'function') {
        ;(field.setText as (t: string) => void)(val)
      } else if ('check' in field && typeof field.check === 'function') {
        if (val === 'checked' || val === 'true') {
          ;(field.check as () => void)()
        } else if ('uncheck' in field && typeof field.uncheck === 'function') {
          ;(field.uncheck as () => void)()
        }
      } else if ('select' in field && typeof field.select === 'function') {
        ;(field.select as (v: string) => void)(val)
      }
    } catch { /* field not found or unsupported */ }
  }

  if (flatten) form.flatten()
  return doc.save()
}

/**
 * Flatten a PDF: bake all form field values as static content (removes
 * editability). Returns new PDF bytes — the caller decides what to do with
 * them (download, write to vault, etc.).
 */
export async function flattenPdf(pdfBytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  const form = doc.getForm()
  form.flatten()
  return doc.save()
}

/**
 * Trigger a browser download for arbitrary bytes.
 */
export function downloadBytes(data: Uint8Array, filename: string, mime = 'application/pdf'): void {
  const blob = new Blob([data], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 100)
}
