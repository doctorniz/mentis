'use client'

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import type { SuggestionProps } from '@tiptap/suggestion'
import type { SlashItem } from '@/lib/editor/slash-items'
import { cn } from '@/utils/cn'

export type SlashCommandListProps = SuggestionProps<SlashItem, SlashItem>

export const SlashCommandList = forwardRef<
  { onSlashKeyDown: (e: KeyboardEvent) => boolean },
  SlashCommandListProps
>(function SlashCommandList(props, ref) {
  const { items, command } = props
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    setSelected(0)
  }, [items])

  useImperativeHandle(ref, () => ({
    onSlashKeyDown: (event: KeyboardEvent) => {
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelected((i) => (i + items.length - 1) % Math.max(items.length, 1))
        return true
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelected((i) => (i + 1) % Math.max(items.length, 1))
        return true
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        const item = items[selected]
        if (item) command(item)
        return true
      }
      return false
    },
  }))

  if (!items.length) {
    return (
      <div className="text-fg-muted px-3 py-2 text-xs">No matches</div>
    )
  }

  return (
    <div role="listbox" aria-label="Slash commands">
      {items.map((item, index) => (
        <button
          key={item.title}
          type="button"
          role="option"
          aria-selected={index === selected}
          className={cn(
            'hover:bg-bg-hover flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left',
            index === selected && 'bg-accent-light',
          )}
          onClick={() => command(item)}
          onMouseEnter={() => setSelected(index)}
        >
          <span className="text-fg font-medium">{item.title}</span>
          <span className="text-fg-muted text-xs">{item.description}</span>
        </button>
      ))}
    </div>
  )
})
