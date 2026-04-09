'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Sparkles } from 'lucide-react'
import { cn } from '@/utils/cn'

export function ComingSoonChat() {
  const [open, setOpen] = useState(false)

  const ui = (
    <div className="pointer-events-none fixed right-5 bottom-5 z-[9999] flex flex-col items-end gap-3">
      {open && (
        <div
          className={cn(
            'pointer-events-auto flex w-80 flex-col overflow-hidden rounded-2xl border shadow-2xl',
            'border-border bg-bg',
          )}
        >
          {/* Header */}
          <div className="bg-accent flex items-center gap-2.5 px-4 py-3">
            <Sparkles className="size-4 text-white/80" aria-hidden />
            <span className="flex-1 text-sm font-semibold text-white">AI Assistant</span>
            <button
              type="button"
              aria-label="Close chat"
              onClick={() => setOpen(false)}
              className="rounded-md p-0.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Messages area */}
          <div className="flex h-56 flex-col items-center justify-center gap-3 px-6">
            <div className="bg-accent/10 flex size-12 items-center justify-center rounded-full">
              <Sparkles className="text-accent size-5" />
            </div>
            <div className="text-center">
              <p className="text-fg text-sm font-semibold">Coming Soon</p>
              <p className="text-fg-muted mt-1 text-xs leading-relaxed">
                Ask your notes anything — summarise, search, and brainstorm with AI.
              </p>
            </div>
          </div>

          {/* Input area */}
          <div className="border-border border-t px-3 py-3">
            <div className="border-border bg-bg-tertiary flex cursor-not-allowed items-center gap-2 rounded-xl border px-3 py-2.5 opacity-50">
              <input
                disabled
                placeholder="Coming Soon…"
                className="text-fg-muted min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:select-none"
              />
              <Sparkles className="text-fg-muted size-4 shrink-0" />
            </div>
          </div>
        </div>
      )}

      {/* FAB toggle */}
      <button
        type="button"
        aria-label={open ? 'Close AI assistant' : 'Open AI assistant (Coming Soon)'}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'pointer-events-auto flex size-12 items-center justify-center rounded-full shadow-lg transition-all',
          'bg-accent text-white hover:bg-accent-hover active:scale-95',
          open && 'rotate-90',
        )}
      >
        {open ? <X className="size-5" /> : <Sparkles className="size-5" />}
      </button>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(ui, document.body)
}
