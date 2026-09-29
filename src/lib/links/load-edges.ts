import { getIndexLinks, whenSearchIndexOpen } from '@/lib/search/index'
import { resolveLinkEdges, type LinkEdge } from './resolve-edges'

/** Links between `paths`, from the index. Reads no files. */
export async function loadLinkEdges(paths: readonly string[]): Promise<LinkEdge[]> {
  await whenSearchIndexOpen()
  const rows = await getIndexLinks()
  return resolveLinkEdges(rows, [...paths].sort())
}
