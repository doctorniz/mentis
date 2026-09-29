import { useEffect, useState } from 'react'
import { INDEX_CHANGED_EVENTS } from '@/lib/search/index-events'
import { loadLinkEdges } from './load-edges'
import type { LinkEdge } from './resolve-edges'

/**
 * Edges between `paths`, kept current as the index changes. `null` until the
 * first load, or while `paths` is `null`.
 */
export function useLinkEdges(paths: readonly string[] | null, refreshKey = 0): LinkEdge[] | null {
  const [edges, setEdges] = useState<LinkEdge[] | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const bump = () => setTick((n) => n + 1)
    for (const name of INDEX_CHANGED_EVENTS) window.addEventListener(name, bump)
    return () => {
      for (const name of INDEX_CHANGED_EVENTS) window.removeEventListener(name, bump)
    }
  }, [])

  useEffect(() => {
    if (!paths) return
    let cancelled = false
    void loadLinkEdges(paths)
      .then((next) => {
        if (!cancelled) setEdges(next)
      })
      .catch(() => {
        if (!cancelled) setEdges([])
      })
    return () => {
      cancelled = true
    }
  }, [paths, refreshKey, tick])

  return edges
}
