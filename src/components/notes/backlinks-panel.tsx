'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Link2 } from 'lucide-react'
import type { FileSystemAdapter } from '@/lib/fs'
import { findBacklinksForNote } from '@/lib/notes/backlinks'
import { cn } from '@/utils/cn'

/** Viewport max-width at which backlinks start collapsed and open as an overlay when expanded. */
export const BACKLINKS_NARROW_MEDIA_QUERY = '(max-width: 1023px)'

export function BacklinksPanel({
  vaultFs,
  markdownPaths,
  activeNotePath,
  scanPulse,
  onOpenNote,
  expanded,
  onExpandedChange,
  isNarrow,
}: {
  vaultFs: FileSystemAdapter
  markdownPaths: string[]
  activeNotePath: string | null
  scanPulse: number
  onOpenNote: (path: string) => void
  expanded: boolean
  onExpandedChange: (open: boolean) => void
  isNarrow: boolean
}) {
  const [backlinks, setBacklinks] = useState<Awaited<ReturnType<typeof findBacklinksForNote>>>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!activeNotePath) {
      setBacklinks([])
      setBusy(false)
      return
    }
    let cancelled = false
    setBusy(true)
    void findBacklinksForNote(vaultFs, markdownPaths, activeNotePath).then((hits) => {
      if (!cancelled) {
        setBacklinks(hits)
        setBusy(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [vaultFs, markdownPaths, activeNotePath, scanPulse])

  const panelBody = (
    <>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => onExpandedChange(false)}
          className="text-fg-muted hover:text-fg hover:bg-bg-hover -ml-1 shrink-0 rounded-md p-1"
          aria-label="Collapse backlinks"
          title="Collapse backlinks"
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
        <Link2 className="text-fg-muted size-3.5 shrink-0" aria-hidden />
        <span className="text-fg-secondary min-w-0 flex-1 truncate text-[11px] font-semibold tracking-wide uppercase">
          Backlinks
        </span>
        {backlinks.length > 0 && (
          <span className="bg-accent/10 text-accent shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
            {backlinks.length}
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {busy ? (
          <p className="text-fg-muted px-2 py-3 text-center text-xs">Scanning…</p>
        ) : backlinks.length === 0 ? (
          <p className="text-fg-muted px-2 py-3 text-center text-xs leading-relaxed">
            {activeNotePath ? 'No notes link here yet.' : 'Open a note to see backlinks.'}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {backlinks.map((b) => (
              <li key={b.path}>
                <button
                  type="button"
                  onClick={() => onOpenNote(b.path)}
                  className={cn(
                    'hover:bg-bg-hover text-fg w-full rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
                    'focus-visible:ring-accent focus-visible:ring-2 focus-visible:outline-none',
                  )}
                >
                  {b.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )

  if (!expanded) {
    return (
      <div className="border-border relative z-20 flex h-full w-10 shrink-0 flex-col items-center border-l py-2">
        <button
          type="button"
          onClick={() => onExpandedChange(true)}
          className="text-fg-muted hover:text-fg hover:bg-bg-hover flex w-full flex-col items-center gap-1 rounded-md px-1 py-2 transition-colors"
          aria-label={
            backlinks.length > 0
              ? `Show backlinks (${backlinks.length})`
              : 'Show backlinks'
          }
          title="Backlinks"
        >
          <Link2 className="size-4 shrink-0" aria-hidden />
          {backlinks.length > 0 && (
            <span className="bg-accent/10 text-accent rounded-full px-1 text-[9px] font-bold tabular-nums">
              {backlinks.length > 99 ? '99+' : backlinks.length}
            </span>
          )}
          <ChevronLeft className="size-3.5 opacity-60" aria-hidden />
        </button>
      </div>
    )
  }

  if (isNarrow) {
    return (
      <div className="relative h-full w-0 shrink-0 overflow-visible">
        <div
          className="border-border bg-bg absolute top-0 right-0 bottom-0 z-20 flex w-[min(280px,88vw)] flex-col border-l shadow-lg"
          role="complementary"
          aria-label="Backlinks"
        >
          {panelBody}
        </div>
      </div>
    )
  }

  return (
    <div
      className="border-border relative z-20 flex h-full w-[min(100%,200px)] shrink-0 flex-col border-l"
      role="complementary"
      aria-label="Backlinks"
    >
      {panelBody}
    </div>
  )
}
