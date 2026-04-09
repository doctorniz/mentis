import type { FileSystemAdapter } from '@/lib/fs'
import { extractWikiLinks, resolveWikiLinkPath } from '@/lib/markdown'

export interface BacklinkHit {
  path: string
  title: string
}

function titleFromPath(path: string): string {
  return path.replace(/\.md$/i, '').split('/').pop() ?? path
}

/** Notes that contain a wiki-link resolving to `targetPath`. */
export async function findBacklinksForNote(
  vaultFs: FileSystemAdapter,
  allMarkdownPaths: string[],
  targetPath: string,
): Promise<BacklinkHit[]> {
  const hits: BacklinkHit[] = []
  for (const p of allMarkdownPaths) {
    if (p === targetPath) continue
    try {
      const raw = await vaultFs.readTextFile(p)
      const links = extractWikiLinks(raw)
      for (const link of links) {
        if (resolveWikiLinkPath(link.target, allMarkdownPaths) === targetPath) {
          hits.push({ path: p, title: titleFromPath(p) })
          break
        }
      }
    } catch {
      // skip unreadable
    }
  }
  return hits.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
}
