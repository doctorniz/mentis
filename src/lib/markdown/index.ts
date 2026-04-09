import matter from 'gray-matter'
import type { NoteDocument, NoteFrontmatter, WikiLink } from '@/types/editor'

export function parseNote(path: string, raw: string): NoteDocument {
  const { data, content } = matter(raw)

  return {
    path,
    frontmatter: data as NoteFrontmatter,
    content,
    rawContent: raw,
  }
}

export function serializeNote(frontmatter: NoteFrontmatter, content: string): string {
  const fm = { ...frontmatter, modified: new Date().toISOString() }
  return matter.stringify(content, fm)
}

const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g

export function extractWikiLinks(content: string): WikiLink[] {
  const links: WikiLink[] = []
  let match: RegExpExecArray | null

  while ((match = WIKI_LINK_RE.exec(content)) !== null) {
    const target = match[1].trim()
    const alias = match[2]?.trim()

    const pageMatch = target.match(/^(.+)#page=(\d+(?:-\d+)?)$/)
    if (pageMatch) {
      links.push({
        target: pageMatch[1],
        alias,
        pageRef: pageMatch[2],
      })
    } else {
      links.push({ target, alias })
    }
  }

  return links
}

export function extractTags(content: string): string[] {
  const tagRe = /(?:^|\s)#([a-zA-Z][\w-/]*)/g
  const tags = new Set<string>()
  let match: RegExpExecArray | null

  while ((match = tagRe.exec(content)) !== null) {
    tags.add(match[1])
  }

  return Array.from(tags)
}

/** Strip the vault file extension from a basename for comparison purposes. */
function stripVaultExt(name: string): string {
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

export function resolveWikiLinkPath(
  link: string,
  allPaths: string[],
): string | null {
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
