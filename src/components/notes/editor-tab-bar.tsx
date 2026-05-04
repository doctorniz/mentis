'use client'

import { X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useEditorStore } from '@/stores/editor'

export function EditorTabBar() {
  const tabs = useEditorStore((s) => s.tabs)
  const activeTabId = useEditorStore((s) => s.activeTabId)
  const setActiveTab = useEditorStore((s) => s.setActiveTab)
  const closeTab = useEditorStore((s) => s.closeTab)

  if (tabs.length <= 1) return null

  return (
    <div
      className="bg-bg-secondary flex shrink-0 items-stretch gap-0 overflow-x-auto"
      role="tablist"
      aria-label="Open notes"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeTabId
        return (
          <div
            key={tab.id}
            role="tab"
            tabIndex={active ? 0 : -1}
            aria-selected={active}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setActiveTab(tab.id)
              }
            }}
            className={cn(
              'group relative flex max-w-[200px] shrink-0 cursor-pointer items-center gap-1.5 px-3.5 py-2 text-left text-xs font-medium transition-colors',
              'focus-visible:ring-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:outline-none',
              active
                ? 'bg-bg text-fg'
                : 'text-fg-muted hover:text-fg-secondary hover:bg-bg-tertiary',
            )}
          >
            {active && (
              <span className="bg-accent absolute inset-x-0 bottom-0 h-0.5 rounded-full" />
            )}
            <span className="min-w-0 flex-1 truncate">
              {tab.isDirty ? (
                <span className="text-accent mr-0.5" aria-hidden>
                  •
                </span>
              ) : null}
              {tab.title}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.id)
              }}
              className="hover:bg-bg-hover -mr-0.5 rounded p-1 opacity-100 transition-opacity md:p-0.5 md:opacity-0 md:group-hover:opacity-100"
              aria-label={`Close ${tab.title}`}
            >
              <X className="size-3" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
