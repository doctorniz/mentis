/** Lightweight in-memory workbook model bridging SheetJS ↔ jspreadsheet-ce. */

export interface CellData {
  /** Display / raw value */
  value: string | number | boolean | null
  /** Formula string (e.g. "=SUM(A1:A10)") if the cell contains one */
  formula?: string
  /** Column-letter style reference, e.g. "A1" — only used internally */
  ref?: string
}

export interface SpreadsheetSheet {
  name: string
  /** 2-D row-major data grid: rows × cols of cell data */
  data: CellData[][]
  /** Column widths in px, indexed by col */
  colWidths: number[]
  /** Merged cell ranges in "A1:B2" notation */
  merges: string[]
}

export interface SpreadsheetWorkbook {
  sheets: SpreadsheetSheet[]
  activeSheetIndex: number
}

/** Default column width in px for jspreadsheet */
export const DEFAULT_COL_WIDTH = 120
/** Minimum grid dimensions for a new / empty sheet */
export const MIN_ROWS = 50
export const MIN_COLS = 26
