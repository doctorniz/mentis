import matter from 'gray-matter'
import type { NoteDocument, NoteFrontmatter, WikiLink } from '@/types/editor'

/**
 * Note parsing with no dependency on the file-type registry, so a worker can
 * use it without loading every module's registration.
 */

export function parseNote(path: string, raw: string): NoteDocument {
  const { data, content } = matter(raw)

  return {
    path,
    frontmatter: data as NoteFrontmatter,
    content,
    rawContent: raw,
  }
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

/** Distinct wiki-link targets in a file's raw text, in order of first appearance. */
export function extractLinkTargets(content: string): string[] {
  return [...new Set(extractWikiLinks(content).map((l) => l.target))]
}
