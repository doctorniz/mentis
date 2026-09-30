'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { useEditorStore } from '@/stores/editor'
import { InlineFileTitle } from '@/components/shell/inline-file-title'
import { Button } from '@/components/ui/button'
import { toast } from '@/stores/toast'
import { vaultPathsPointToSameFile } from '@/lib/fs/vault-path-equiv'
import { readXlsxFile } from '@/lib/spreadsheet/xlsx-io'
import type { SpreadsheetWorkbook } from '@/lib/spreadsheet/types'
import { DEFAULT_COL_WIDTH, MIN_ROWS, MIN_COLS } from '@/lib/spreadsheet/types'

/**
 * Read-only spreadsheet viewer powered by jspreadsheet-ce.
 *
 * Loads `.xlsx` / `.xls` / `.csv` files via SheetJS and shows them in a locked
 * grid. Nothing is written back to the file. The library is lazy-loaded so the
 * bundle is only pulled when a spreadsheet tab is actually opened.
 */
export function SpreadsheetViewer({
  tabId,
  path,
  onRenamed,
}: {
  tabId: string
  path: string
  onRenamed?: () => void
}) {
  const { vaultFs } = useVaultSession()
  const retargetTabPath = useEditorStore((s) => s.retargetTabPath)
  const pathRef = useRef(path)
  pathRef.current = path

  const containerRef = useRef<HTMLDivElement>(null)
  const workbookRef = useRef<SpreadsheetWorkbook | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeSheet, setActiveSheet] = useState(0)
  const [sheetNames, setSheetNames] = useState<string[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [jspreadsheet, setJspreadsheet] = useState<any>(null)

  // ---- Create jspreadsheet instance for a sheet ----
  const mountSheet = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (jss: any, container: HTMLDivElement, sheet: SpreadsheetWorkbook['sheets'][number]) => {
      // Convert CellData[][] to string[][] for jspreadsheet
      const data = sheet.data.map((row) =>
        row.map((cell) => {
          if (cell.formula) return cell.formula
          if (cell.value === null || cell.value === undefined) return ''
          return String(cell.value)
        }),
      )

      // Build columns config
      const columns = sheet.colWidths.map((w) => ({
        width: w,
      }))

      const instance = jss(container, {
        data,
        columns,
        minDimensions: [MIN_COLS, MIN_ROWS],
        defaultColWidth: DEFAULT_COL_WIDTH,
        tableOverflow: true,
        tableWidth: '100%',
        tableHeight: '100%',
        editable: false,
        allowInsertRow: false,
        allowInsertColumn: false,
        allowDeleteRow: false,
        allowDeleteColumn: false,
        allowRenameColumn: false,
        allowComments: false,
        columnSorting: false,
        columnDrag: false,
        rowDrag: false,
        contextMenu: false,
        search: true,
        // Merge cells (jspreadsheet uses { A1: [colSpan, rowSpan] } format)
        ...(sheet.merges.length
          ? {
              mergeCells: Object.fromEntries(
                sheet.merges.map((m) => {
                  const [start, end] = m.split(':')
                  // Decode range to compute span
                  const sCol = start.replace(/[0-9]/g, '')
                  const sRow = parseInt(start.replace(/[^0-9]/g, ''), 10)
                  const eCol = end.replace(/[0-9]/g, '')
                  const eRow = parseInt(end.replace(/[^0-9]/g, ''), 10)
                  const colSpan = eCol.charCodeAt(0) - sCol.charCodeAt(0) + 1 // Simplified single-letter
                  const rowSpan = eRow - sRow + 1
                  return [start, [colSpan, rowSpan]]
                }),
              ),
            }
          : {}),
      })

      return instance
    },
    [],
  )

  // ---- Load file + jspreadsheet library ----
  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const [bytes, jssModule, _jsuites] = await Promise.all([
          vaultFs.readFile(path),
          import('jspreadsheet-ce'),
          import('jsuites'),
        ])
        if (cancelled) return

        // Import CSS
        await Promise.all([
          import('jspreadsheet-ce/dist/jspreadsheet.css'),
          import('jsuites/dist/jsuites.css'),
        ]).catch(() => {
          // CSS imports may fail in some bundler configs; jspreadsheet
          // still works, we just need to inject styles manually as fallback.
        })

        const jss = jssModule.default || jssModule
        setJspreadsheet(() => jss)

        const wb = readXlsxFile(bytes)
        workbookRef.current = wb
        setSheetNames(wb.sheets.map((s) => s.name))
        setActiveSheet(wb.activeSheetIndex)
        setLoading(false)
      } catch (e) {
        console.error('Spreadsheet editor load failed', e)
        if (!cancelled) {
          setError('Failed to load this spreadsheet file.')
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
    // Re-load only when the tab identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId])

  // ---- Mount the active sheet's grid ----
  useEffect(() => {
    if (loading || !jspreadsheet || !workbookRef.current || !containerRef.current) return

    const container = containerRef.current
    // Clear previous instance
    container.innerHTML = ''

    const sheet = workbookRef.current.sheets[activeSheet]
    if (!sheet) return

    try {
      mountSheet(jspreadsheet, container, sheet)
    } catch (e) {
      console.error('Failed to mount jspreadsheet', e)
      setError('Failed to render spreadsheet grid.')
    }
  }, [loading, jspreadsheet, activeSheet, mountSheet])

  const switchSheet = useCallback((idx: number) => setActiveSheet(idx), [])

  // ---- Download ----
  const handleDownload = useCallback(async () => {
    try {
      const bytes = await vaultFs.readFile(pathRef.current)
      const ext = pathRef.current.split('.').pop()?.toLowerCase() ?? 'xlsx'
      const mimeMap: Record<string, string> = {
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        xls: 'application/vnd.ms-excel',
        csv: 'text/csv',
        tsv: 'text/tab-separated-values',
        ods: 'application/vnd.oasis.opendocument.spreadsheet',
      }
      const blob = new Blob([bytes as BlobPart], {
        type: mimeMap[ext] ?? 'application/octet-stream',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = pathRef.current.split('/').pop() ?? `spreadsheet.${ext}`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to download file')
    }
  }, [vaultFs])

  // ---- Rename ----
  function handleRename(oldPath: string, newStem: string) {
    const nameWithExt = oldPath.split('/').pop() ?? oldPath
    const ext = nameWithExt.includes('.') ? nameWithExt.slice(nameWithExt.lastIndexOf('.')) : ''
    const fullName = newStem.endsWith(ext) ? newStem : `${newStem}${ext}`
    const parent = oldPath.includes('/') ? oldPath.slice(0, oldPath.lastIndexOf('/')) : ''
    const newPath = parent ? `${parent}/${fullName}` : fullName

    if (vaultPathsPointToSameFile(newPath, oldPath)) return

    void (async () => {
      try {
        if ((await vaultFs.exists(newPath)) && !vaultPathsPointToSameFile(newPath, oldPath)) {
          toast.error('A file with that name already exists')
          return
        }
        await vaultFs.rename(oldPath, newPath)
        retargetTabPath(
          tabId,
          newPath,
          newPath
            .replace(/\.[^/.]+$/i, '')
            .split('/')
            .pop() ?? newPath,
        )
        pathRef.current = newPath
        onRenamed?.()
        window.dispatchEvent(new CustomEvent('ink:vault-changed'))
      } catch {
        toast.error('Failed to rename')
      }
    })()
  }

  // ---- Determine file extension label ----
  const extLabel = (pathRef.current.split('.').pop() ?? 'xlsx').toLowerCase()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Toolbar — file title + download */}
      <div className="border-border bg-bg-secondary flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
        <InlineFileTitle path={path} onRename={handleRename} />
        <span className="text-fg-muted font-mono text-xs">.{extLabel}</span>

        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="size-7 p-0"
            onClick={() => void handleDownload()}
            aria-label="Download spreadsheet"
            title="Download"
          >
            <Download className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Sheet tabs */}
      {!loading && !error && sheetNames.length > 0 && (
        <div className="border-border bg-bg flex shrink-0 items-center gap-0.5 overflow-x-auto border-b px-2 py-1">
          {sheetNames.map((name, idx) => (
            <button
              key={idx}
              type="button"
              className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs transition-colors ${
                idx === activeSheet
                  ? 'bg-accent/15 text-accent font-medium'
                  : 'text-fg-secondary hover:bg-bg-tertiary'
              }`}
              onClick={() => switchSheet(idx)}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Grid area */}
      <div className="relative min-h-0 flex-1 overflow-auto">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-fg-muted text-sm">Loading spreadsheet…</span>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-danger text-sm">{error}</span>
          </div>
        )}

        {!loading && !error && (
          <div ref={containerRef} className="spreadsheet-container h-full w-full" />
        )}
      </div>
    </div>
  )
}
