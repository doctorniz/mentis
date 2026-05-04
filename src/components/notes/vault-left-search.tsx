'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, FileType, LayoutGrid, Search, X } from 'lucide-react'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { searchVault } from '@/lib/search/index'
import { parseSearchQuery } from '@/lib/search/parse-query'
import type { SearchResult } from '@/types/search'
import { useEditorStore } from '@/stores/editor'
import { useFileTreeStore } from '@/stores/file-tree'
import { cn } from '@/utils/cn'

const TYPE_ICONS: Record<string, typeof FileText> = {
  markdown: FileText,
  pdf: FileType,
  canvas: LayoutGrid,
}

interface VaultLeftSearchProps {
  onClose: () => void
  /** Optional CSS override for the root container (mirrors NotesFileTree's rootClassName) */
  rootClassName?: string
}

export function VaultLeftSearch({ onClose, rootClassName }: VaultLeftSearchProps) {
  const { vaultFs } = useVaultSession()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus when the panel opens
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [])

  // 200 ms debounce
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query), 200)
    return () => window.clearTimeout(t)
  }, [query])

  // Run search whenever debounced query changes
  useEffect(() => {
    const { text, hashTags } = parseSearchQuery(debounced)
    if (!text.length && !hashTags.length) {
      setResults([])
      return
    }
    setResults(searchVault(debounced, {}))
  }, [debounced])

  const openResult = useCallback(
    (r: SearchResult) => {
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
    },
    [vaultFs],
  )

  return (
    <div
      className={cn(
        'border-border bg-bg flex h-full w-[min(100%,240px)] shrink-0 flex-col border-r',
        rootClassName,
      )}
    >
      {/* Search input header — mirrors tree header height */}
      <div className="border-border flex items-center gap-1.5 border-b px-3 py-2">
        <Search className="text-fg-muted size-3.5 shrink-0" aria-hidden />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search vault…"
          className="text-fg placeholder:text-fg-muted min-w-0 flex-1 bg-transparent text-xs focus:outline-none"
          aria-label="Search vault"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              if (query) setQuery('')
              else onClose()
            }
          }}
        />
        <button
          type="button"
          onClick={() => {
            if (query) setQuery('')
            else onClose()
          }}
          className="text-fg-muted hover:text-fg shrink-0 rounded p-0.5 transition-colors"
          aria-label={query ? 'Clear search' : 'Close search'}
          title={query ? 'Clear' : 'Back to file tree'}
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Results list */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto py-1">
        {results.length === 0 && debounced.trim() ? (
          <p className="text-fg-muted px-3 py-6 text-center text-xs">No matches</p>
        ) : results.length === 0 ? (
          <p className="text-fg-muted px-3 py-6 text-center text-xs">
            Type to search notes, PDFs and files
          </p>
        ) : (
          results.map((r) => {
            const Icon = TYPE_ICONS[r.type] ?? FileText
            const folder =
              r.path.includes('/') ? r.path.slice(0, r.path.lastIndexOf('/')) : ''
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => openResult(r)}
                className="hover:bg-bg-hover flex items-start gap-2 px-3 py-2 text-left"
              >
                <Icon className="text-fg-muted mt-0.5 size-3 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-fg truncate text-xs font-medium">{r.title}</p>
                  {r.snippetHit ? (
                    <p className="text-fg-muted mt-0.5 line-clamp-2 text-[10px] leading-relaxed">
                      {r.snippetBefore}
                      <mark className="bg-highlight-yellow text-fg rounded px-0.5">
                        {r.snippetHit}
                      </mark>
                      {r.snippetAfter}
                    </p>
                  ) : folder ? (
                    <p className="text-fg-tertiary mt-0.5 truncate text-[10px]">{folder}</p>
                  ) : null}
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
