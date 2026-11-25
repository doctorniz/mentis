import { useEffect, useState, type RefObject } from 'react'

/**
 * Whether `target` is within `margin` of what `root` shows (a CSS margin, so
 * `'100%'` is one screenful of the root either side). Long documents draw
 * only their pages near the screen this way, keeping memory flat however long
 * they are. Without IntersectionObserver everything counts as near.
 */
export function useNearViewport(
  target: RefObject<Element | null>,
  root: RefObject<Element | null>,
  margin = '100%',
): boolean {
  const [near, setNear] = useState(false)

  useEffect(() => {
    const el = target.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        const last = entries[entries.length - 1]
        if (last) setNear(last.isIntersecting)
      },
      { root: root.current, rootMargin: margin },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [target, root, margin])

  return near
}
