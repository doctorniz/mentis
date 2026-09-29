import { parseNote } from '@/lib/markdown/parse'
import { SEARCH_CONTENT_CAP } from '@/lib/search/content-cap'
import type { SearchExtractor } from '@/core/registries/file-types'

/** The deck's markdown without front matter; its `title` directive if set. */
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
    return { title, content }
  } catch {
    return { content: '' }
  }
}

export default extract
