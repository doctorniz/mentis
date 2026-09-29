import type { LinkRow } from '@/core/index/protocol'
import { createWikiLinkResolver } from '@/lib/markdown'

export interface LinkEdge {
  source: string
  target: string
}

/**
 * Turn the index's wiki-links, as written, into edges between files. Only
 * links written in a file of `paths` count, and only ones that resolve to
 * another of `paths`. Callers pass the paths in a stable order, because a link
 * that could match several files goes to the first.
 */
export function resolveLinkEdges(rows: readonly LinkRow[], paths: readonly string[]): LinkEdge[] {
  const inScope = new Set(paths)
  const resolve = createWikiLinkResolver(paths)
  const seen = new Set<string>()
  const edges: LinkEdge[] = []
  for (const { source, target } of rows) {
    if (!inScope.has(source)) continue
    const resolved = resolve(target)
    if (!resolved || resolved === source) continue
    const key = `${source}\0${resolved}`
    if (seen.has(key)) continue
    seen.add(key)
    edges.push({ source, target: resolved })
  }
  return edges
}
