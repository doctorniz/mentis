// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest'
import * as XLSX from 'xlsx'
import { readXlsxFile } from '@/lib/spreadsheet/xlsx-io'
import { SAFE_GRID_OPTIONS, sheetToGrid } from '@/components/notes/spreadsheet-viewer'

// Quoted strings survive jspreadsheet's upper-casing, so this reaches `new Function`.
const PAYLOAD = '=[]["filter"]["constructor"]("self.pwned=42")()'

async function mount(bytes: Uint8Array) {
  const wb = readXlsxFile(bytes)
  const jss = (await import('jspreadsheet-ce')).default as any
  const el = document.createElement('div')
  document.body.appendChild(el)
  jss(el, { data: sheetToGrid(wb.sheets[0]), editable: false, ...SAFE_GRID_OPTIONS })
  return el
}

describe('spreadsheet viewer never evaluates cell formulas', () => {
  afterEach(() => {
    delete (self as { pwned?: unknown }).pwned
    document.body.innerHTML = ''
  })

  it('csv formula cell', async () => {
    const csv = `a,b\n1,"${PAYLOAD.replace(/"/g, '""')}"\n`
    const el = await mount(new TextEncoder().encode(csv))
    expect((self as { pwned?: unknown }).pwned).toBeUndefined()
    expect(el.textContent).toContain('self.pwned=42')
  })

  it('xlsx string cell starting with =', async () => {
    const ws = XLSX.utils.aoa_to_sheet([['a'], [{ t: 's', v: PAYLOAD }]])
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, ws, 'S')
    const bytes = new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }))
    await mount(bytes)
    expect((self as { pwned?: unknown }).pwned).toBeUndefined()
  })

  it('shows the cached value of an xlsx formula, not the formula', () => {
    const ws = XLSX.utils.aoa_to_sheet([[1, 2, { t: 'n', v: 3, f: 'A1+B1' }]])
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, ws, 'S')
    const wb = readXlsxFile(new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' })))
    expect(sheetToGrid(wb.sheets[0])[0].slice(0, 3)).toEqual(['1', '2', '3'])
  })
})
