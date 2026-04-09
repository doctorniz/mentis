'use client'

import { FolderInput, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function FbBatchToolbar({
  count,
  onMove,
  onDelete,
  onClear,
}: {
  count: number
  onMove: () => void
  onDelete: () => void
  onClear: () => void
}) {
  if (count === 0) return null

  return (
    <div className="border-border bg-bg-secondary pointer-events-auto fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-lg border px-3 py-2 shadow-lg">
      <span className="text-fg text-sm font-medium">
        {count} selected
      </span>
      <Button variant="secondary" size="sm" onClick={onMove}>
        <FolderInput className="size-4" />
        Move
      </Button>
      <Button variant="danger" size="sm" onClick={onDelete}>
        <Trash2 className="size-4" />
        Delete
      </Button>
      <button
        type="button"
        onClick={onClear}
        className="text-fg-muted hover:text-fg ml-auto rounded-md p-1"
        aria-label="Clear selection"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
