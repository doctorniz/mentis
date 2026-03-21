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

export function resolveWikiLinkPath(
  link: string,
  allPaths: string[],
): string | null {
  const normalized = link.toLowerCase().replace(/\s+/g, '-')

  const exact = allPaths.find((p) => {
    const filename = p.split('/').pop()?.replace(/\.md$/, '').toLowerCase()
    return filename === normalized
  })

  if (exact) return exact

  const partial = allPaths.find((p) => p.toLowerCase().includes(normalized))
  return partial ?? null
}
