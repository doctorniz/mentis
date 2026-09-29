import matter from 'gray-matter'
import { fileTypes } from '@/core/registries'
import type { NoteFrontmatter } from '@/types/editor'

export { parseNote, extractTags, extractWikiLinks } from './parse'

export function serializeNote(frontmatter: NoteFrontmatter, content: string): string {
  const fm = { ...frontmatter, modified: new Date().toISOString() }
  return matter.stringify(content, fm)
}

/**
 * Strip the vault file extension from a basename for comparison purposes.
 * Linkable types lose their whole (possibly compound) suffix — `board.kan.md`
 * compares as `board`; other names keep the historic md/pdf/canvas rule.
 */
function stripVaultExt(name: string): string {
  const suffix = fileTypes.matchedSuffix(name)
  if (suffix && fileTypes.resolve(name)?.linkable) return name.slice(0, name.length - suffix.length)
  return name.replace(/\.(md|pdf|canvas)$/i, '')
}

/** Collapse whitespace and lowercase — used for partial path fallback. */
function normStr(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Basename / link target key: lowercase, strip extension, remove spaces, hyphens, underscores
 * so `My Note`, `my-note`, and `my_note` match the same file.
 */
function wikiStemKey(s: string): string {
  return stripVaultExt(s)
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
    .trim()
}

export function resolveWikiLinkPath(link: string, allPaths: string[]): string | null {
  const needleKey = wikiStemKey(link)

  // Exact basename match (e.g. "My Note" ↔ `my-note.md`)
  const exact = allPaths.find((p) => {
    const stem = p.split('/').pop() ?? ''
    return wikiStemKey(stem) === needleKey
  })
  if (exact) return exact

  // Partial path match (fallback)
  const needle = normStr(link)
  const partial = allPaths.find((p) => normStr(p).includes(needle))
  return partial ?? null
}

/**
 * `resolveWikiLinkPath` for many links against one list of paths: the same
 * answers, but the list is keyed once instead of scanned for every link.
 */
export function createWikiLinkResolver(
  allPaths: readonly string[],
): (link: string) => string | null {
  const byStem = new Map<string, string>()
  for (const p of allPaths) {
    const key = wikiStemKey(p.split('/').pop() ?? '')
    if (!byStem.has(key)) byStem.set(key, p)
  }
  let normalised: string[] | null = null
  const cache = new Map<string, string | null>()

  return (link) => {
    const hit = cache.get(link)
    if (hit !== undefined) return hit
    let found = byStem.get(wikiStemKey(link)) ?? null
    if (!found) {
      normalised ??= allPaths.map(normStr)
      const needle = normStr(link)
      const i = normalised.findIndex((p) => p.includes(needle))
      found = i === -1 ? null : allPaths[i]
    }
    cache.set(link, found)
    return found
  }
}
