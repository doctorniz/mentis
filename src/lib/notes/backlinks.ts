import type { LinkEdge } from '@/lib/links/resolve-edges'

export interface BacklinkHit {
  path: string
  title: string
}

function titleFromPath(path: string): string {
  return path.replace(/\.md$/i, '').split('/').pop() ?? path
}

/** Notes with a link resolving to `targetPath`, by title. */
export function backlinksFor(edges: readonly LinkEdge[], targetPath: string): BacklinkHit[] {
  return edges
    .filter((e) => e.target === targetPath)
    .map((e) => ({ path: e.source, title: titleFromPath(e.source) }))
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
}
