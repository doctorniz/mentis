'use client'

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import type { SuggestionProps } from '@tiptap/suggestion'
import type { WikiLinkPick } from '@/lib/editor/wiki-link-types'
import { cn } from '@/utils/cn'

export type WikiLinkListProps = SuggestionProps<WikiLinkPick, WikiLinkPick>

export const WikiLinkList = forwardRef<
  { onWikiLinkKeyDown: (e: KeyboardEvent) => boolean },
  WikiLinkListProps
>(function WikiLinkList(props, ref) {
  const { items, command } = props
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    setSelected(0)
  }, [items])

  useImperativeHandle(ref, () => ({
    onWikiLinkKeyDown: (event: KeyboardEvent) => {
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
      <div className="text-fg-muted px-3 py-2 text-xs">No matching notes</div>
    )
  }

  return (
    <div role="listbox" aria-label="Wiki link targets">
      {items.map((item, index) => (
        <button
          key={item.path}
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
          <span className="text-fg-muted truncate text-xs">{item.path}</span>
        </button>
      ))}
    </div>
  )
})
