'use client'

import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { ChevronDown, ChevronRight, ChevronUp, X } from 'lucide-react'
import { findReplaceKey } from '@/lib/editor/find-replace'
import { cn } from '@/utils/cn'

/**
 * Floating find/replace card for the visual markdown editor. Opened by
 * Ctrl+F / the mode-bar button; source mode uses CodeMirror's own panel
 * instead. Match state lives in the FindReplace ProseMirror plugin —
 * this component just mirrors the count for display.
 */
export function FindReplaceBar({
  editor,
  initialTerm,
  focusPulse = 0,
  onClose,
  className,
}: {
  editor: Editor
  /** Prefill (e.g. the editor's current selection). */
  initialTerm?: string
  /** Bump to refocus the find input while the bar is already open (repeat Ctrl+F). */
  focusPulse?: number
  onClose: () => void
  className?: string
}) {
  const [term, setTerm] = useState(initialTerm ?? '')
  const [replacement, setReplacement] = useState('')
  const [showReplace, setShowReplace] = useState(false)
  const [matchCount, setMatchCount] = useState(0)
  const [activeIndex, setActiveIndex] = useState(0)
  const findInputRef = useRef<HTMLInputElement>(null)

  // Mirror plugin match state on every editor transaction.
  useEffect(() => {
    const update = () => {
      const fr = findReplaceKey.getState(editor.state)
      setMatchCount(fr?.matches.length ?? 0)
      setActiveIndex(fr?.activeIndex ?? 0)
    }
    editor.on('transaction', update)
    update()
    return () => {
      editor.off('transaction', update)
    }
  }, [editor])

  // Seed the plugin with the initial term on mount.
  useEffect(() => {
    if (initialTerm) editor.commands.setFindTerm(initialTerm)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Focus on mount and again whenever the parent pulses (repeat Ctrl+F).
  useEffect(() => {
    const input = findInputRef.current
    if (input) {
      input.focus()
      input.select()
    }
  }, [focusPulse])

  function close() {
    editor.commands.clearFind()
    onClose()
    editor.commands.focus()
  }

  function handleFindKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) editor.commands.findPrev()
      else editor.commands.findNext()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  function handleReplaceKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      editor.commands.replaceActive(replacement)
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  const hasMatches = matchCount > 0

  return (
    <div
      role="search"
      aria-label="Find in note"
      className={cn(
        'border-border bg-bg flex flex-col gap-1 rounded-lg border p-1.5 shadow-lg',
        className,
      )}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setShowReplace((v) => !v)}
          title={showReplace ? 'Hide replace' : 'Replace'}
          aria-label={showReplace ? 'Hide replace' : 'Replace'}
          aria-expanded={showReplace}
          className="text-fg-muted hover:text-fg hover:bg-bg-hover flex size-6 shrink-0 items-center justify-center rounded-md transition-colors"
        >
          {showReplace ? (
            <ChevronDown className="size-3.5" aria-hidden />
          ) : (
            <ChevronRight className="size-3.5" aria-hidden />
          )}
        </button>
        <input
          ref={findInputRef}
          type="text"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value)
            editor.commands.setFindTerm(e.target.value)
          }}
          onKeyDown={handleFindKeyDown}
          placeholder="Find"
          aria-label="Find"
          className={cn(
            'bg-bg-secondary text-fg placeholder:text-fg-muted w-44 rounded-md px-2 py-1 text-sm outline-none',
            'focus:ring-accent focus:ring-1',
          )}
        />
        <span
          className={cn(
            'w-14 shrink-0 text-center text-xs tabular-nums',
            term && !hasMatches ? 'text-danger' : 'text-fg-muted',
          )}
          aria-live="polite"
        >
          {term ? (hasMatches ? `${activeIndex + 1}/${matchCount}` : '0/0') : ''}
        </span>
        <button
          type="button"
          onClick={() => editor.commands.findPrev()}
          disabled={!hasMatches}
          title="Previous (Shift+Enter)"
          aria-label="Previous match"
          className="text-fg-secondary hover:text-fg hover:bg-bg-hover flex size-6 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-40"
        >
          <ChevronUp className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => editor.commands.findNext()}
          disabled={!hasMatches}
          title="Next (Enter)"
          aria-label="Next match"
          className="text-fg-secondary hover:text-fg hover:bg-bg-hover flex size-6 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-40"
        >
          <ChevronDown className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={close}
          title="Close (Esc)"
          aria-label="Close find"
          className="text-fg-muted hover:text-fg hover:bg-bg-hover flex size-6 shrink-0 items-center justify-center rounded-md transition-colors"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>

      {showReplace && (
        <div className="flex items-center gap-1 pl-7">
          <input
            type="text"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={handleReplaceKeyDown}
            placeholder="Replace"
            aria-label="Replace with"
            className={cn(
              'bg-bg-secondary text-fg placeholder:text-fg-muted w-44 rounded-md px-2 py-1 text-sm outline-none',
              'focus:ring-accent focus:ring-1',
            )}
          />
          <button
            type="button"
            onClick={() => editor.commands.replaceActive(replacement)}
            disabled={!hasMatches}
            className="text-fg-secondary hover:text-fg hover:bg-bg-hover rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:opacity-40"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={() => editor.commands.replaceAllMatches(replacement)}
            disabled={!hasMatches}
            className="text-fg-secondary hover:text-fg hover:bg-bg-hover rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:opacity-40"
          >
            All
          </button>
        </div>
      )}
    </div>
  )
}
