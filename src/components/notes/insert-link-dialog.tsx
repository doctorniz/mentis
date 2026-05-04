'use client'

import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  FileText,
  File,
  Presentation,
  Search,
  X,
} from 'lucide-react'
import { cn } from '@/utils/cn'

interface InsertLinkDialogProps {
  open: boolean
  /** When set, only shows files matching this extension (e.g. '.canvas') */
  filterExt?: string
  title?: string
  /** All vault file paths to display */
  allPaths: string[]
  onInsert: (path: string) => void
  onClose: () => void
}

function fileIcon(path: string) {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'md') return <FileText className="text-fg-muted size-3.5 shrink-0" />
  if (ext === 'canvas') return <Presentation className="text-fg-muted size-3.5 shrink-0" />
  return <File className="text-fg-muted size-3.5 shrink-0" />
}

export function InsertLinkDialog({
  open,
  filterExt,
  title = 'Link to file',
  allPaths,
  onInsert,
  onClose,
}: InsertLinkDialogProps) {
  const [query, setQuery] = useState('')

  // Reset query when dialog opens
  useEffect(() => {
    if (open) setQuery('')
  }, [open])

  const filtered = allPaths
    .filter((p) => {
      if (filterExt && !p.toLowerCase().endsWith(filterExt.toLowerCase())) return false
      if (query.trim()) {
        const name = p.split('/').pop()?.toLowerCase() ?? ''
        return name.includes(query.toLowerCase()) || p.toLowerCase().includes(query.toLowerCase())
      }
      return true
    })
    .slice(0, 200)

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[299] bg-black/40 backdrop-blur-[1px]" />
        <Dialog.Content
          className="border-border bg-bg fixed top-1/2 left-1/2 z-[300] flex w-[min(100vw-2rem,440px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border shadow-xl outline-none"
          style={{ maxHeight: 'min(90vh, 480px)' }}
        >
          {/* Header */}
          <div className="border-border flex shrink-0 items-center justify-between border-b px-4 py-3">
            <Dialog.Title className="text-fg text-sm font-semibold">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="text-fg-muted hover:text-fg rounded p-0.5 transition-colors"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Search */}
          <div className="border-border flex shrink-0 items-center gap-2 border-b px-3 py-2">
            <Search className="text-fg-muted size-3.5 shrink-0" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search files…"
              className="text-fg placeholder:text-fg-muted min-w-0 flex-1 bg-transparent text-sm focus:outline-none"
            />
          </div>

          {/* File list */}
          <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2">
            {filtered.length === 0 ? (
              <p className="text-fg-muted py-6 text-center text-sm">No files found</p>
            ) : (
              filtered.map((path) => {
                const name = path.split('/').pop() ?? path
                return (
                  <button
                    key={path}
                    type="button"
                    onClick={() => { onInsert(path); onClose() }}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                      'hover:bg-bg-hover',
                    )}
                  >
                    {fileIcon(path)}
                    <span className="text-fg min-w-0 flex-1 truncate text-sm">{name}</span>
                    <span className="text-fg-muted min-w-0 max-w-[8rem] truncate text-right text-xs">
                      {path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
