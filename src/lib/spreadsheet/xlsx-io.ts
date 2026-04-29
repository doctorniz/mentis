/**
 * SheetJS ↔ SpreadsheetWorkbook bridge.
 *
 * Reads `.xlsx` / `.xls` / `.csv` binary into our intermediate model,
 * and serialises the model back to `.xlsx` bytes for saving to the vault.
 */
import * as XLSX from 'xlsx'
import type { SpreadsheetWorkbook, SpreadsheetSheet, CellData } from './types'
import { DEFAULT_COL_WIDTH, MIN_ROWS, MIN_COLS } from './types'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Convert a 0-based column index to a letter (0→A, 25→Z, 26→AA …). */
function colLetter(idx: number): string {
  let s = ''
  let n = idx
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s
    n = Math.floor(n / 26) - 1
  }
  return s
}

/** Pad a 2-D array to at least `rows × cols`. */
function padGrid(grid: CellData[][], rows: number, cols: number): CellData[][] {
  const emptyCell = (): CellData => ({ value: '' })
  while (grid.length < rows) grid.push([])
  for (const row of grid) {
    while (row.length < cols) row.push(emptyCell())
  }
  return grid
}

/* ------------------------------------------------------------------ */
/*  Read                                                               */
/* ------------------------------------------------------------------ */

export function readXlsxFile(bytes: Uint8Array): SpreadsheetWorkbook {
  const wb = XLSX.read(bytes, { type: 'array', cellFormula: true, cellStyles: true })

  const sheets: SpreadsheetSheet[] = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name]
    if (!ws) return emptySheet(name)

    const ref = ws['!ref']
    if (!ref) return emptySheet(name)

    const range = XLSX.utils.decode_range(ref)
    const rowCount = Math.max(range.e.r + 1, MIN_ROWS)
    const colCount = Math.max(range.e.c + 1, MIN_COLS)

    const data: CellData[][] = []
    for (let r = 0; r < rowCount; r++) {
      const row: CellData[] = []
      for (let c = 0; c < colCount; c++) {
        const addr = colLetter(c) + (r + 1)
        const cell = ws[addr] as XLSX.CellObject | undefined
        if (cell) {
          row.push({
            value: cell.v instanceof Date ? cell.v.toISOString()
              : cell.v != null ? (cell.v as string | number | boolean) : '',
            formula: cell.f ? `=${cell.f}` : undefined,
            ref: addr,
          })
        } else {
          row.push({ value: '' })
        }
      }
      data.push(row)
    }

    // Column widths
    const colWidths: number[] = []
    const wsCols = ws['!cols'] ?? []
    for (let c = 0; c < colCount; c++) {
      const w = wsCols[c]
      colWidths.push(w?.wpx ?? (w?.wch ? w.wch * 8 : DEFAULT_COL_WIDTH))
    }

    // Merges
    const merges: string[] = (ws['!merges'] ?? []).map((m: XLSX.Range) => {
      const s = colLetter(m.s.c) + (m.s.r + 1)
      const e = colLetter(m.e.c) + (m.e.r + 1)
      return `${s}:${e}`
    })

    return { name, data, colWidths, merges }
  })

  return { sheets, activeSheetIndex: 0 }
}

/* ------------------------------------------------------------------ */
/*  Write                                                              */
/* ------------------------------------------------------------------ */

/** Map file extension to SheetJS BookType. */
export function bookTypeFromPath(path: string): XLSX.BookType {
  const ext = path.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'csv': return 'csv'
    case 'xls': return 'biff8'
    case 'xlsm': return 'xlsm'
    case 'xlsb': return 'xlsb'
    case 'ods': return 'ods'
    case 'tsv':
    case 'txt': return 'txt'
    default: return 'xlsx'
  }
}

/**
 * Convert a `SpreadsheetWorkbook` back to file bytes.
 *
 * `bookType` defaults to `'xlsx'` but callers should pass the original
 * format (via `bookTypeFromPath`) so that `.csv` stays `.csv`, `.xls`
 * stays `.xls`, etc.
 */
export function writeSpreadsheetFile(
  workbook: SpreadsheetWorkbook,
  bookType: XLSX.BookType = 'xlsx',
): Uint8Array {
  const wb = XLSX.utils.book_new()

  for (const sheet of workbook.sheets) {
    const ws: XLSX.WorkSheet = {}

    let maxR = 0
    let maxC = 0

    for (let r = 0; r < sheet.data.length; r++) {
      for (let c = 0; c < sheet.data[r].length; c++) {
        const cell = sheet.data[r][c]
        const raw = cell.formula ?? cell.value
        if (raw === '' || raw === null || raw === undefined) continue

        const addr = colLetter(c) + (r + 1)

        if (cell.formula) {
          // Strip leading '=' for SheetJS
          const f = typeof cell.formula === 'string' && cell.formula.startsWith('=')
            ? cell.formula.slice(1)
            : cell.formula
          ws[addr] = { t: 's', f, v: cell.value ?? '' } as XLSX.CellObject
        } else if (typeof cell.value === 'number') {
          ws[addr] = { t: 'n', v: cell.value } as XLSX.CellObject
        } else if (typeof cell.value === 'boolean') {
          ws[addr] = { t: 'b', v: cell.value } as XLSX.CellObject
        } else {
          const s = String(cell.value)
          // Attempt to parse as number if it looks numeric
          const num = Number(s)
          if (s !== '' && !isNaN(num)) {
            ws[addr] = { t: 'n', v: num } as XLSX.CellObject
          } else {
            ws[addr] = { t: 's', v: s } as XLSX.CellObject
          }
        }

        if (r > maxR) maxR = r
        if (c > maxC) maxC = c
      }
    }

    ws['!ref'] = `A1:${colLetter(maxC)}${maxR + 1}`

    // Column widths (not applicable to CSV/TSV but harmless to set)
    if (sheet.colWidths.length) {
      ws['!cols'] = sheet.colWidths.map((w) => ({ wpx: w }))
    }

    // Merges (only relevant for xlsx/xls/ods)
    if (sheet.merges.length) {
      ws['!merges'] = sheet.merges.map((m) => XLSX.utils.decode_range(m))
    }

    XLSX.utils.book_append_sheet(wb, ws, sheet.name)
  }

  const out = XLSX.write(wb, { bookType, type: 'array' }) as ArrayBuffer
  return new Uint8Array(out)
}

/** @deprecated Use `writeSpreadsheetFile` with an explicit bookType. */
export function writeXlsxFile(workbook: SpreadsheetWorkbook): Uint8Array {
  return writeSpreadsheetFile(workbook, 'xlsx')
}

/* ------------------------------------------------------------------ */
/*  Create blank                                                       */
/* ------------------------------------------------------------------ */

function emptySheet(name: string): SpreadsheetSheet {
  return {
    name,
    data: padGrid([], MIN_ROWS, MIN_COLS),
    colWidths: Array.from({ length: MIN_COLS }, () => DEFAULT_COL_WIDTH),
    merges: [],
  }
}

/** Create a minimal blank `.xlsx` file (single empty sheet). */
export function createBlankXlsx(): Uint8Array {
  const workbook: SpreadsheetWorkbook = {
    sheets: [emptySheet('Sheet1')],
    activeSheetIndex: 0,
  }
  return writeXlsxFile(workbook)
}

/* ------------------------------------------------------------------ */
/*  Text extraction (for search indexing)                               */
/* ------------------------------------------------------------------ */

/** Extract all cell text from an xlsx for search indexing. */
export function extractXlsxText(bytes: Uint8Array, cap = 14_000): string {
  try {
    const wb = XLSX.read(bytes, { type: 'array' })
    const chunks: string[] = []
    let len = 0
    for (const name of wb.SheetNames) {
      if (len >= cap) break
      const ws = wb.Sheets[name]
      if (!ws) continue
      const csv = XLSX.utils.sheet_to_csv(ws)
      chunks.push(csv)
      len += csv.length
    }
    const text = chunks.join('\n')
    return text.length > cap ? text.slice(0, cap) : text
  } catch {
    return ''
  }
}
