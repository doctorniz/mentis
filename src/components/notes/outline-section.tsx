'use client'

/**
 * Collapsible headings-outline section for the unified editor right
 * column, stacked alongside BacklinksSection. Reads headings live from
 * the Tiptap editor (not from disk) so the outline tracks unsaved
 * edits; clicking a heading scrolls the editor to it.
 */

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, List } from 'lucide-react'
import type { Editor } from '@tiptap/core'
import { cn } from '@/utils/cn'

type OutlineHeading = { level: number; text: string; pos: number }

function extractHeadings(editor: Editor): OutlineHeading[] {
  const out: OutlineHeading[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      out.push({ level: node.attrs.level as number, text: node.textContent, pos })
      return false
    }
    return true
  })
  return out
}

export function OutlineSection({
  editor,
  collapsed,
  onCollapsedChange,
  maxExpandedHeightClass = 'max-h-[40%]',
}: {
  /** Live editor of the active markdown tab; null while loading / for non-markdown tabs. */
  editor: Editor | null
  collapsed: boolean
  onCollapsedChange: (v: boolean) => void
  /** Tailwind class cap on the expanded list; default 40% of container. */
  maxExpandedHeightClass?: string
}) {
  const [headings, setHeadings] = useState<OutlineHeading[]>([])

  useEffect(() => {
    if (!editor) {
      setHeadings([])
      return
    }
    const update = () => setHeadings(extractHeadings(editor))
    editor.on('update', update)
    update()
    return () => {
      editor.off('update', update)
    }
  }, [editor])

  function scrollToHeading(h: OutlineHeading) {
    if (!editor) return
    editor
      .chain()
      .focus(h.pos + 1, { scrollIntoView: false })
      .run()
    const dom = editor.view.nodeDOM(h.pos)
    if (dom instanceof HTMLElement) {
      dom.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
  }

  // Same grow-vs-cap logic as BacklinksSection: only grow when we're
  // explicitly told to fill the column.
  const growsToFill = !collapsed && maxExpandedHeightClass === 'flex-1'

  return (
    <section
      className={cn(
        'border-border flex flex-col border-t',
        growsToFill ? 'min-h-0 flex-1' : 'shrink-0',
        collapsed ? 'h-auto' : maxExpandedHeightClass,
      )}
      aria-label="Outline"
    >
      <button
        type="button"
        onClick={() => onCollapsedChange(!collapsed)}
        className="hover:bg-bg-hover flex w-full shrink-0 items-center gap-2 px-3 py-2 text-left"
        aria-expanded={!collapsed}
      >
        {collapsed ? (
          <ChevronRight className="text-fg-muted size-3.5 shrink-0" aria-hidden />
        ) : (
          <ChevronDown className="text-fg-muted size-3.5 shrink-0" aria-hidden />
        )}
        <List className="text-fg-muted size-3.5 shrink-0" aria-hidden />
        <span className="text-fg-secondary min-w-0 flex-1 truncate text-[11px] font-semibold tracking-wide uppercase">
          Outline
        </span>
        {headings.length > 0 && (
          <span className="bg-accent/10 text-accent shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
            {headings.length}
          </span>
        )}
      </button>

      {!collapsed && (
        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
          {headings.length === 0 ? (
            <p className="text-fg-muted px-2 py-3 text-center text-xs leading-relaxed">
              No headings.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {headings.map((h) => (
                <li key={`${h.pos}-${h.text}`}>
                  <button
                    type="button"
                    onClick={() => scrollToHeading(h)}
                    style={{ paddingLeft: `${10 + (h.level - 1) * 12}px` }}
                    className={cn(
                      'hover:bg-bg-hover text-fg w-full truncate rounded-md py-1.5 pr-2.5 text-left text-sm transition-colors',
                      'focus-visible:ring-accent focus-visible:ring-2 focus-visible:outline-none',
                      h.level === 1 && 'font-medium',
                    )}
                  >
                    {h.text || 'Untitled heading'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
