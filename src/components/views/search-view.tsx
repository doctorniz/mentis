'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { FileText, FileType, LayoutGrid, Search } from 'lucide-react'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { searchVault } from '@/lib/search/index'
import { parseSearchQuery } from '@/lib/search/parse-query'
import { rebuildVaultSearchIndex } from '@/lib/search/build-vault-index'
import type { SearchFilters, SearchResult } from '@/types/search'
import { Button } from '@/components/ui/button'
import { useUiStore } from '@/stores/ui'
import { useEditorStore } from '@/stores/editor'
import { useFileTreeStore } from '@/stores/file-tree'
import { ViewMode } from '@/types/vault'

const ALL_TYPES = ['markdown', 'pdf', 'canvas'] as const

function hasExtraFilters(f: SearchFilters): boolean {
  return Boolean(
    f.folder?.trim() ||
    f.tags?.length ||
    f.dateRange?.from ||
    f.dateRange?.to ||
    (f.fileType !== undefined && f.fileType.length < ALL_TYPES.length),
  )
}

function groupByType(results: SearchResult[]): Record<string, SearchResult[]> {
  const g: Record<string, SearchResult[]> = { markdown: [], pdf: [], canvas: [] }
  for (const r of results) {
    g[r.type]?.push(r)
  }
  return g
}

export function SearchView() {
  const { vaultFs } = useVaultSession()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [includeMd, setIncludeMd] = useState(true)
  const [includePdf, setIncludePdf] = useState(true)
  const [includeCanvas, setIncludeCanvas] = useState(true)
  const [folderPrefix, setFolderPrefix] = useState('')
  const [extraTags, setExtraTags] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [reindexBusy, setReindexBusy] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query), 220)
    return () => window.clearTimeout(t)
  }, [query])

  const filters = useMemo<SearchFilters>(() => {
    const types: SearchFilters['fileType'] = []
    if (includeMd) types.push('markdown')
    if (includePdf) types.push('pdf')
    if (includeCanvas) types.push('canvas')
    const fileType =
      types.length === 0 ? [] : types.length === ALL_TYPES.length ? undefined : types
    const tagStr = extraTags
      .split(/[,\s]+/)
      .map((x) => x.replace(/^#/, '').trim().toLowerCase())
      .filter(Boolean)
    return {
      fileType,
      folder: folderPrefix.trim() || undefined,
      tags: tagStr.length ? tagStr : undefined,
      dateRange:
        dateFrom || dateTo
          ? { from: dateFrom || undefined, to: dateTo || undefined }
          : undefined,
    }
  }, [includeMd, includePdf, includeCanvas, folderPrefix, extraTags, dateFrom, dateTo])

  useEffect(() => {
    const { text, hashTags } = parseSearchQuery(debounced)
    const shouldRun = text.length > 0 || hashTags.length > 0 || hasExtraFilters(filters)
    if (!shouldRun) {
      setResults([])
      return
    }

    setResults(searchVault(debounced, filters))
  }, [debounced, filters])

  const grouped = useMemo(() => groupByType(results), [results])

  const openResult = useCallback((r: SearchResult) => {
    useUiStore.getState().setActiveView(ViewMode.Vault)
    useFileTreeStore.getState().setSelectedPath(r.path)
    useEditorStore.getState().addRecentFile(r.path)

    void (async () => {
      const { detectEditorTabType } = await import('@/lib/notes/editor-tab-from-path')
      const type = await detectEditorTabType(vaultFs, r.path)
      useEditorStore.getState().openTab({
        id: crypto.randomUUID(),
        path: r.path,
        type,
        title: r.title,
        isDirty: false,
      })
    })()
  }, [vaultFs])

  async function handleReindex() {
    setReindexBusy(true)
    try {
      await rebuildVaultSearchIndex(vaultFs)
      setResults(searchVault(debounced, filters))
    } finally {
      setReindexBusy(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-6">
      <header className="shrink-0">
        <h2 className="text-fg text-xl font-semibold tracking-tight">Search</h2>
        <p className="text-fg-secondary mt-1 max-w-2xl text-sm">
          Full-text search across notes and file names. Use{' '}
          <code className="text-fg bg-bg-tertiary rounded px-1 py-0.5 text-xs">#tag</code> in the
          query for tag filters.
        </p>
      </header>

      <div className="border-border-strong bg-bg flex shrink-0 flex-col gap-3 rounded-xl border p-3">
        <div className="relative">
          <Search
            className="text-fg-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search… (try #idea meeting)"
            className="border-border-strong focus:border-accent focus:ring-accent/20 bg-bg-secondary placeholder:text-fg-muted w-full rounded-lg border py-2 pr-3 pl-10 text-sm focus:ring-2 focus:outline-none"
            aria-label="Search vault"
          />
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <fieldset className="flex flex-wrap gap-2">
            <legend className="text-fg-muted sr-only">File types</legend>
            <label className="text-fg-secondary flex cursor-pointer items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={includeMd}
                onChange={(e) => setIncludeMd(e.target.checked)}
                className="accent-accent"
              />
              Notes
            </label>
            <label className="text-fg-secondary flex cursor-pointer items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={includePdf}
                onChange={(e) => setIncludePdf(e.target.checked)}
                className="accent-accent"
              />
              PDF
            </label>
            <label className="text-fg-secondary flex cursor-pointer items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={includeCanvas}
                onChange={(e) => setIncludeCanvas(e.target.checked)}
                className="accent-accent"
              />
              Canvas
            </label>
          </fieldset>
          <label className="flex min-w-[140px] flex-1 flex-col gap-1 text-xs">
            <span className="text-fg-muted">Folder prefix</span>
            <input
              value={folderPrefix}
              onChange={(e) => setFolderPrefix(e.target.value)}
              placeholder="e.g. Journal"
              className="border-border bg-bg-secondary text-fg rounded-md border px-2 py-1.5"
            />
          </label>
          <label className="flex min-w-[140px] flex-1 flex-col gap-1 text-xs">
            <span className="text-fg-muted">Tags (comma)</span>
            <input
              value={extraTags}
              onChange={(e) => setExtraTags(e.target.value)}
              placeholder="work, draft"
              className="border-border bg-bg-secondary text-fg rounded-md border px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-fg-muted">Modified from</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border-border bg-bg-secondary text-fg rounded-md border px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-fg-muted">To</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border-border bg-bg-secondary text-fg rounded-md border px-2 py-1.5"
            />
          </label>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={reindexBusy}
            onClick={() => void handleReindex()}
          >
            {reindexBusy ? 'Indexing…' : 'Rebuild index'}
          </Button>
        </div>
      </div>

      <SearchResultsList
        results={results}
        grouped={grouped}
        debounced={debounced}
        filters={filters}
        onOpen={openResult}
      />
    </div>
  )
}

/* ---- Virtualized search results ---- */

type FlatRow =
  | { kind: 'header'; type: string; label: string; count: number }
  | { kind: 'item'; result: SearchResult }

const TYPE_LABELS: Record<string, string> = { markdown: 'Notes', pdf: 'PDFs', canvas: 'Canvases' }
const TYPE_ICONS: Record<string, typeof FileText> = { markdown: FileText, pdf: FileType, canvas: LayoutGrid }

function SearchResultsList({
  results,
  grouped,
  debounced,
  filters,
  onOpen,
}: {
  results: SearchResult[]
  grouped: Record<string, SearchResult[]>
  debounced: string
  filters: SearchFilters
  onOpen: (r: SearchResult) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const flatRows = useMemo<FlatRow[]>(() => {
    const rows: FlatRow[] = []
    for (const type of ['markdown', 'pdf', 'canvas'] as const) {
      const list = grouped[type]
      if (!list?.length) continue
      rows.push({ kind: 'header', type, label: TYPE_LABELS[type]!, count: list.length })
      for (const r of list) rows.push({ kind: 'item', result: r })
    }
    return rows
  }, [grouped])

  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (flatRows[i]?.kind === 'header' ? 36 : 80),
    overscan: 8,
  })

  if (results.length === 0 && (debounced.trim() || hasExtraFilters(filters))) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <p className="text-fg-muted text-sm">No matches.</p>
      </div>
    )
  }
  if (results.length === 0) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <p className="text-fg-muted text-sm">Type a query or apply filters to search.</p>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((vi) => {
          const row = flatRows[vi.index]!
          if (row.kind === 'header') {
            const Icon = TYPE_ICONS[row.type]!
            return (
              <div
                key={`h-${row.type}`}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)`, height: vi.size }}
              >
                <h3 className="text-fg-secondary flex items-center gap-2 pt-4 pb-1 text-xs font-semibold tracking-wide uppercase">
                  <Icon className="size-3.5" aria-hidden />
                  {row.label}
                  <span className="text-fg-muted font-normal">({row.count})</span>
                </h3>
              </div>
            )
          }
          const r = row.result
          return (
            <div
              key={r.id}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)`, height: vi.size }}
            >
              <button
                type="button"
                onClick={() => onOpen(r)}
                className="border-border hover:border-accent hover:bg-accent-light/40 bg-bg mb-2 w-full rounded-lg border px-3 py-2.5 text-left transition-colors"
              >
                <div className="text-fg font-medium">{r.title}</div>
                <div className="text-fg-muted mt-0.5 truncate text-xs">{r.path}</div>
                {(r.snippetBefore || r.snippetHit || r.snippetAfter) && (
                  <p className="text-fg-secondary mt-2 line-clamp-2 text-sm leading-relaxed">
                    {r.snippetBefore}
                    {r.snippetHit ? (
                      <mark className="bg-highlight-yellow text-fg rounded px-0.5">
                        {r.snippetHit}
                      </mark>
                    ) : null}
                    {r.snippetAfter}
                  </p>
                )}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
