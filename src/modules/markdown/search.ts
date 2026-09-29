import { extractTags, parseNote } from '@/lib/markdown/parse'
import { SEARCH_CONTENT_CAP } from '@/lib/search/content-cap'
import type { SearchExtractor } from '@/core/registries/file-types'
import type { NoteFrontmatter } from '@/types/editor'

function normalizeDocTags(fm: NoteFrontmatter, content: string): string[] {
  const fromBody = extractTags(content)
  const raw = fm.tags as unknown
  let fromFm: string[] = []
  if (Array.isArray(raw)) {
    fromFm = raw.map((x) => String(x).toLowerCase())
  } else if (typeof raw === 'string') {
    fromFm = raw
      .split(/[,\s]+/)
      .map((t) => t.replace(/^#/, '').toLowerCase())
      .filter(Boolean)
  }
  return [...new Set([...fromFm, ...fromBody])]
}

/** Frontmatter title, tags (frontmatter + inline #tags) and body. Unreadable notes are skipped. */
const extract: SearchExtractor<string> = ({ path, data }) => {
  try {
    const doc = parseNote(path, data)
    const title =
      typeof doc.frontmatter.title === 'string' && doc.frontmatter.title
        ? doc.frontmatter.title
        : undefined
    const content =
      doc.content.length > SEARCH_CONTENT_CAP
        ? doc.content.slice(0, SEARCH_CONTENT_CAP)
        : doc.content
    return { title, content, tags: normalizeDocTags(doc.frontmatter, doc.content) }
  } catch {
    return null
  }
}

export default extract
