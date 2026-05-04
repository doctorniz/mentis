'use client'

/**
 * Unified editor right-column layout.
 *
 * Hosts the chat panel and (optionally) a collapsible backlinks
 * section in a single resizable column. Both sections are accordion-
 * style: each can be independently collapsed to a thin header bar.
 *
 * The column itself supports three states:
 *   - **expanded**: resizable split with divider
 *   - **collapsed rail**: a narrow icon strip that re-expands on click
 *   - **auto-collapsed**: when the container width falls below
 *     `autoCollapseBelow`, the column collapses to the rail
 *     automatically; it restores when there's room again (unless the
 *     user manually collapsed it).
 *
 * Width is persisted in localStorage by `storageKey` — pass distinct
 * keys per surface (markdown vs. pdf) so each remembers its own width.
 */

import {
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
} from 'react'
import { MessageSquare, Link2, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { ResizableSplit } from '@/components/ui/resizable-split'

export interface EditorRightColumnProps {
  /** The editor (markdown note / pdf viewer). */
  children: ReactNode
  /** Chat panel content (always present; collapse state handled inside). */
  chat: ReactNode | null
  /** Optional collapsible section (usually <BacklinksSection />). */
  trailing?: ReactNode
  /** Width persistence key; separate keys let md/pdf remember distinct widths. */
  storageKey: string
  /** Default right-column width when no saved value exists. */
  defaultRightPx?: number
  /** Minimum right-column width before the divider refuses further drag. */
  minRightPx?: number
  /** Cap on the right-column width as a fraction of the container. */
  maxRightRatio?: number
  /** Container width (px) below which the column auto-collapses. */
  autoCollapseBelow?: number
  /** Whether the whole column is collapsed to a rail. */
  columnCollapsed?: boolean
  /** Called when the column collapse state should change. */
  onColumnCollapsedChange?: (collapsed: boolean) => void
}

export function EditorRightColumn({
  children,
  chat,
  trailing,
  storageKey,
  defaultRightPx = 420,
  minRightPx = 220,
  maxRightRatio = 0.6,
  autoCollapseBelow = 700,
  columnCollapsed = false,
  onColumnCollapsedChange,
}: EditorRightColumnProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  /** Track whether the user manually toggled — suppress auto-restore in that case. */
  const userToggledRef = useRef(false)

  const toggleColumn = useCallback(() => {
    userToggledRef.current = true
    onColumnCollapsedChange?.(!columnCollapsed)
  }, [columnCollapsed, onColumnCollapsedChange])

  // Auto-collapse / auto-restore based on container width.
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? el.clientWidth
      if (width > 0 && width < autoCollapseBelow && !columnCollapsed) {
        userToggledRef.current = false
        onColumnCollapsedChange?.(true)
      } else if (
        width >= autoCollapseBelow &&
        columnCollapsed &&
        !userToggledRef.current
      ) {
        onColumnCollapsedChange?.(false)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [autoCollapseBelow, columnCollapsed, onColumnCollapsedChange])

  const rightHasContent = chat != null || trailing != null

  return (
    <div ref={containerRef} className="flex min-h-0 min-w-0 flex-1">
      <ResizableSplit
        storageKey={storageKey}
        defaultRightPx={defaultRightPx}
        minRightPx={minRightPx}
        maxRightRatio={maxRightRatio}
        collapsed={columnCollapsed || !rightHasContent}
        left={children}
        right={
          !columnCollapsed && rightHasContent ? (
            <div className="bg-bg flex h-full min-h-0 w-full flex-col">
              {/* Collapse-rail toggle at top of column */}
              <div className="border-border flex shrink-0 items-center justify-end border-b px-1.5 py-1">
                <button
                  type="button"
                  onClick={toggleColumn}
                  title="Collapse panel"
                  aria-label="Collapse panel"
                  className="text-fg-muted hover:text-fg hover:bg-bg-hover flex size-7 items-center justify-center rounded-md transition-colors"
                >
                  <PanelRightClose className="size-4" />
                </button>
              </div>
              {/* Backlinks section at top (collapsed = just header) */}
              {trailing}
              {/* Chat fills the remaining space at bottom */}
              {chat != null && <div className="min-h-0 flex-1">{chat}</div>}
            </div>
          ) : null
        }
      />

      {/* Collapsed rail — thin strip with icons to re-expand */}
      {columnCollapsed && rightHasContent && (
        <div className="border-border bg-bg flex h-full w-10 shrink-0 flex-col items-center gap-1 border-l pt-2">
          <button
            type="button"
            onClick={toggleColumn}
            title="Expand panel"
            aria-label="Expand panel"
            className="text-fg-muted hover:text-fg hover:bg-bg-hover flex size-8 items-center justify-center rounded-md transition-colors"
          >
            <PanelRightOpen className="size-4" />
          </button>
          {chat != null && (
            <button
              type="button"
              onClick={toggleColumn}
              title="Chat"
              aria-label="Open chat"
              className="text-fg-muted hover:text-fg hover:bg-bg-hover flex size-8 items-center justify-center rounded-md transition-colors"
            >
              <MessageSquare className="size-4" />
            </button>
          )}
          {trailing != null && (
            <button
              type="button"
              onClick={toggleColumn}
              title="Backlinks"
              aria-label="Open backlinks"
              className="text-fg-muted hover:text-fg hover:bg-bg-hover flex size-8 items-center justify-center rounded-md transition-colors"
            >
              <Link2 className="size-4" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
