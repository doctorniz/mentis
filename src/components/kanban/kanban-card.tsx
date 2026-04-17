'use client'

import { useCallback, useRef, useState } from 'react'
import { Check, GripVertical, Trash2 } from 'lucide-react'
import type { KanbanCard } from '@/types/kanban'
import { cn } from '@/utils/cn'

export const DRAG_MIME = 'application/x-ink-kanban-card'
const CARD_PREFIX = 'ink-kanban-card:'

export function setKanbanCardDragData(e: React.DragEvent, cardId: string, columnId: string) {
  const payload = JSON.stringify({ cardId, fromColumn: columnId })
  e.dataTransfer.setData(DRAG_MIME, payload)
  e.dataTransfer.setData('text/plain', `${CARD_PREFIX}${payload}`)
  e.dataTransfer.effectAllowed = 'move'
}

export function readKanbanCardDragData(e: React.DragEvent): { cardId: string; fromColumn: string } | null {
  let raw = ''
  try {
    raw = e.dataTransfer.getData(DRAG_MIME)
  } catch { /* ignore */ }
  if (!raw) {
    const plain = e.dataTransfer.getData('text/plain')
    if (plain.startsWith(CARD_PREFIX)) raw = plain.slice(CARD_PREFIX.length)
  }
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { cardId: string; fromColumn: string }
    if (parsed.cardId && parsed.fromColumn) return parsed
  } catch { /* ignore */ }
  return null
}

export function kanbanCardDragActive(types: readonly string[]): boolean {
  return Array.from(types).includes(DRAG_MIME)
}

export function KanbanCardItem({
  card,
  columnId,
  onToggle,
  onDelete,
  onRename,
}: {
  card: KanbanCard
  columnId: string
  onToggle: (cardId: string) => void
  onDelete: (cardId: string) => void
  onRename: (cardId: string, title: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(card.title)

  const commitRename = useCallback(() => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== card.title) {
      onRename(card.id, trimmed)
    } else {
      setDraft(card.title)
    }
    setEditing(false)
  }, [draft, card.id, card.title, onRename])

  return (
    <div
      className={cn(
        'border-border bg-bg group flex max-h-32 min-h-0 items-start gap-2 rounded-lg border px-3 py-2 shadow-sm transition-shadow hover:shadow-md',
        card.checked && 'opacity-50',
      )}
    >
      <button
        type="button"
        draggable
        onDragStart={(e) => {
          e.stopPropagation()
          setKanbanCardDragData(e, card.id, columnId)
        }}
        className="text-fg-muted/30 hover:text-fg-muted mt-0.5 shrink-0 cursor-grab rounded p-0.5 active:cursor-grabbing"
        aria-label="Drag card"
      >
        <GripVertical className="size-3.5" />
      </button>

      <button
        type="button"
        onClick={() => onToggle(card.id)}
        className={cn(
          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border-2 transition-colors',
          card.checked
            ? 'border-accent bg-accent'
            : 'border-border-strong hover:border-accent',
        )}
      >
        {card.checked && <Check className="text-accent-fg size-2.5" strokeWidth={3} />}
      </button>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        {editing ? (
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitRename() }
              if (e.key === 'Escape') { setDraft(card.title); setEditing(false) }
            }}
            autoFocus
            className="text-fg w-full bg-transparent text-sm outline-none"
          />
        ) : (
          <span
            className={cn(
              'block cursor-text text-sm whitespace-pre-wrap break-words',
              card.checked ? 'text-fg-muted line-through' : 'text-fg',
            )}
            onClick={() => { setDraft(card.title); setEditing(true) }}
          >
            {card.title || 'Untitled'}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => onDelete(card.id)}
        className="text-fg-muted/0 group-hover:text-fg-muted hover:text-destructive mt-0.5 shrink-0 rounded p-0.5 transition-colors"
        aria-label="Delete card"
      >
        <Trash2 className="size-3" />
      </button>
    </div>
  )
}
