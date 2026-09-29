import matter from 'gray-matter'
import type { NoteDocument, NoteFrontmatter } from '@/types/editor'

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
