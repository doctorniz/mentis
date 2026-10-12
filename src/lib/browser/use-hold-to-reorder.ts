import { useEffect, useRef, useState } from 'react'

/**
 * Reorder a list by pressing and holding an item, then dragging it. Works the
 * same with a finger, a pen or a mouse.
 *
 * Holding still for `delay` ms picks the item up; moving before that is a
 * scroll, left to the browser. While an item is held the list does not
 * scroll, and dropping it calls `onMove(from, to)`.
 *
 * Put `listRef` on the list (as its `ref`) and `itemProps(index)` on each item.
 */
export function useHoldToReorder<T extends HTMLElement>(
  onMove: (from: number, to: number) => void,
  delay = 300,
) {
  // A callback ref: the list may appear after the first render (while loading).
  const [list, listRef] = useState<T | null>(null)
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null)
  const held = useRef<{
    index: number
    pointerId: number
    x: number
    y: number
    el: Element
    timer: ReturnType<typeof setTimeout> | null
    active: boolean
  } | null>(null)
  const onMoveRef = useRef(onMove)
  onMoveRef.current = onMove

  // Touch scrolling can only be stopped from a non-passive listener.
  useEffect(() => {
    if (!list) return
    const block = (e: Event) => {
      if (held.current?.active) e.preventDefault()
    }
    list.addEventListener('touchmove', block, { passive: false })
    list.addEventListener('contextmenu', block)
    return () => {
      list.removeEventListener('touchmove', block)
      list.removeEventListener('contextmenu', block)
    }
  }, [list])

  const indexAt = (y: number): number | null => {
    const items = list?.querySelectorAll<HTMLElement>('[data-reorder-index]')
    if (!items?.length) return null
    for (const item of items) {
      const box = item.getBoundingClientRect()
      if (y < box.top + box.height / 2) return Number(item.dataset.reorderIndex)
    }
    return Number(items[items.length - 1]!.dataset.reorderIndex)
  }

  const end = (drop: boolean) => {
    const h = held.current
    held.current = null
    if (!h) return
    if (h.timer) clearTimeout(h.timer)
    setDrag((d) => {
      if (drop && h.active && d && d.from !== d.over) onMoveRef.current(d.from, d.over)
      return null
    })
  }

  const itemProps = (index: number) => ({
    'data-reorder-index': index,
    onPointerDown(e: React.PointerEvent) {
      if (e.button !== 0 || held.current) return
      // Editing text in the item: a long press there selects text.
      if (e.target instanceof HTMLElement && e.target === document.activeElement) return
      const el = e.currentTarget
      const h = {
        index,
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        el,
        timer: null as ReturnType<typeof setTimeout> | null,
        active: false,
      }
      h.timer = setTimeout(() => {
        h.timer = null
        h.active = true
        el.setPointerCapture?.(h.pointerId)
        navigator.vibrate?.(10)
        setDrag({ from: index, over: index })
      }, delay)
      held.current = h
    },
    onPointerMove(e: React.PointerEvent) {
      const h = held.current
      if (!h || h.pointerId !== e.pointerId) return
      if (!h.active) {
        if (Math.hypot(e.clientX - h.x, e.clientY - h.y) > 8) end(false)
        return
      }
      const over = indexAt(e.clientY)
      if (over !== null) setDrag((d) => (d && d.over !== over ? { ...d, over } : d))
    },
    onPointerUp(e: React.PointerEvent) {
      if (held.current?.pointerId === e.pointerId) end(true)
    },
    onPointerCancel() {
      end(false)
    },
  })

  return { listRef, itemProps, drag }
}
