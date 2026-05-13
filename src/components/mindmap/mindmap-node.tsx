'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Plus } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { MindmapNodeData } from '@/types/mindmap'

const COLOR_STYLES: Record<string, { border: string; bg: string; dot: string }> = {
  teal:    { border: 'border-teal-400 dark:border-teal-500',    bg: 'bg-teal-50 dark:bg-teal-950/60',    dot: 'bg-teal-400' },
  violet:  { border: 'border-violet-400 dark:border-violet-500', bg: 'bg-violet-50 dark:bg-violet-950/60', dot: 'bg-violet-400' },
  amber:   { border: 'border-amber-400 dark:border-amber-500',  bg: 'bg-amber-50 dark:bg-amber-950/60',  dot: 'bg-amber-400' },
  rose:    { border: 'border-rose-400 dark:border-rose-500',    bg: 'bg-rose-50 dark:bg-rose-950/60',    dot: 'bg-rose-400' },
  sky:     { border: 'border-sky-400 dark:border-sky-500',      bg: 'bg-sky-50 dark:bg-sky-950/60',      dot: 'bg-sky-400' },
  emerald: { border: 'border-emerald-400 dark:border-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/60', dot: 'bg-emerald-400' },
}

const DEFAULT_STYLE = { border: 'border-border', bg: 'bg-bg-secondary', dot: 'bg-fg-muted' }

export interface MindmapNodeCallbacks {
  onAddChild: (nodeId: string) => void
  onLabelChange: (nodeId: string, label: string) => void
  onStartEdit: (nodeId: string) => void
  onEndEdit: (nodeId: string) => void
}

export type MindmapNodeType = {
  id: string
  data: MindmapNodeData & MindmapNodeCallbacks
  position: { x: number; y: number }
}

export function MindmapNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as MindmapNodeData & MindmapNodeCallbacks
  const { label, color, editing, onAddChild, onLabelChange, onStartEdit, onEndEdit } = nodeData

  const [localLabel, setLocalLabel] = useState(label)
  const inputRef = useRef<HTMLInputElement>(null)
  const style = (color && COLOR_STYLES[color]) || DEFAULT_STYLE

  // Sync external label changes when not editing
  useEffect(() => {
    if (!editing) setLocalLabel(label)
  }, [label, editing])

  // Focus input when editing starts
  useEffect(() => {
    if (editing) {
      const t = setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 30)
      return () => clearTimeout(t)
    }
  }, [editing])

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onStartEdit?.(id)
    },
    [id, onStartEdit],
  )

  const handleBlur = useCallback(() => {
    const trimmed = localLabel.trim()
    onLabelChange?.(id, trimmed || label)
    onEndEdit?.(id)
  }, [id, label, localLabel, onLabelChange, onEndEdit])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        inputRef.current?.blur()
      }
      if (e.key === 'Escape') {
        setLocalLabel(label)
        onEndEdit?.(id)
      }
      e.stopPropagation()
    },
    [id, label, onEndEdit],
  )

  const handleAddClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onAddChild?.(id)
    },
    [id, onAddChild],
  )

  return (
    <div
      className={cn(
        'group relative flex min-w-[100px] max-w-[200px] items-center rounded-xl border-2 px-3 py-2 shadow-sm transition-all',
        style.border,
        style.bg,
        selected && 'ring-2 ring-teal-400/60 ring-offset-1',
      )}
      onDoubleClick={handleDoubleClick}
    >
      {/* Left handle (incoming) */}
      <Handle
        type="target"
        position={Position.Left}
        className="!size-2 !border-none !bg-transparent"
      />

      {/* Color dot */}
      {color && (
        <span className={cn('mr-2 size-2 shrink-0 rounded-full', style.dot)} aria-hidden />
      )}

      {/* Label / inline editor */}
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={localLabel}
          onChange={(e) => setLocalLabel(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="text-fg min-w-0 flex-1 border-none bg-transparent text-sm font-medium outline-none"
          placeholder="Node label"
        />
      ) : (
        <span className="text-fg min-w-0 flex-1 truncate text-sm font-medium leading-snug">
          {label || <span className="text-fg-muted italic">Untitled</span>}
        </span>
      )}

      {/* Right handle (outgoing) */}
      <Handle
        type="source"
        position={Position.Right}
        className="!size-2 !border-none !bg-transparent"
      />

      {/* Add-child button — visible on hover/selection */}
      <button
        type="button"
        onClick={handleAddClick}
        aria-label="Add child node"
        className={cn(
          'absolute -right-8 top-1/2 -translate-y-1/2',
          'flex size-6 items-center justify-center rounded-full border',
          'border-border bg-bg text-fg-muted shadow-sm',
          'opacity-0 transition-opacity group-hover:opacity-100',
          selected && 'opacity-100',
        )}
      >
        <Plus className="size-3" aria-hidden />
      </button>
    </div>
  )
}
