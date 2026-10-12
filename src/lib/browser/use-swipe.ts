import { useRef, useState } from 'react'

/**
 * A horizontal swipe on touch (and pen) input. Mouse drags are left alone:
 * on a desktop they select text.
 *
 * The gesture is decided by the first clear movement: mostly sideways and it
 * is a swipe (the element follows the finger through `dx`); mostly up or down
 * and it is a scroll, left to the browser. A swipe that starts in something
 * that can itself scroll sideways (a wide calendar week, a code block) is
 * left to that, too. The element should have `touch-action: pan-y`.
 */
export function useSwipe({
  onLeft,
  onRight,
  threshold = 72,
  enabled = true,
}: {
  /** Swiped towards the left (finger moved left). */
  onLeft?: () => void
  /** Swiped towards the right. */
  onRight?: () => void
  /** How far, in CSS pixels, counts as a swipe. */
  threshold?: number
  enabled?: boolean
}) {
  const [dx, setDx] = useState(0)
  const start = useRef<{ id: number; x: number; y: number; mode: 'undecided' | 'swipe' } | null>(
    null,
  )
  // A swipe ends in a click on the element; that click is not a tap.
  const justSwiped = useRef(false)

  const reset = () => {
    start.current = null
    setDx(0)
  }

  const handlers = {
    onPointerDown(e: React.PointerEvent) {
      if (!enabled || e.pointerType === 'mouse' || start.current) return
      if (scrollsSideways(e.target as Element, e.currentTarget as Element)) return
      start.current = { id: e.pointerId, x: e.clientX, y: e.clientY, mode: 'undecided' }
    },
    onPointerMove(e: React.PointerEvent) {
      const s = start.current
      if (!s || s.id !== e.pointerId) return
      const mx = e.clientX - s.x
      const my = e.clientY - s.y
      if (s.mode === 'undecided') {
        if (Math.abs(mx) < 10 && Math.abs(my) < 10) return
        if (Math.abs(my) >= Math.abs(mx)) {
          start.current = null // a scroll
          return
        }
        s.mode = 'swipe'
        ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
      }
      // Follow the finger only towards directions that do something.
      setDx((mx < 0 && !onLeft) || (mx > 0 && !onRight) ? 0 : mx)
    },
    onPointerUp(e: React.PointerEvent) {
      const s = start.current
      if (!s || s.id !== e.pointerId) return
      const mx = e.clientX - s.x
      const swiped = s.mode === 'swipe'
      reset()
      if (!swiped) return
      justSwiped.current = true
      setTimeout(() => (justSwiped.current = false), 0)
      if (mx <= -threshold) onLeft?.()
      else if (mx >= threshold) onRight?.()
    },
    onPointerCancel: reset,
    onClickCapture(e: React.MouseEvent) {
      if (!justSwiped.current) return
      justSwiped.current = false
      e.stopPropagation()
      e.preventDefault()
    },
  }

  return { dx, swiping: dx !== 0, handlers }
}

/** Whether `el` or an ancestor up to `stop` can scroll horizontally. */
function scrollsSideways(el: Element | null, stop: Element): boolean {
  for (let n = el; n && n !== stop.parentElement; n = n.parentElement) {
    if (n instanceof HTMLElement && n.scrollWidth > n.clientWidth + 1) {
      const overflow = getComputedStyle(n).overflowX
      if (overflow === 'auto' || overflow === 'scroll') return true
    }
  }
  return false
}
