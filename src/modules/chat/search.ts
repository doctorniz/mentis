import { parseNote } from '@/lib/markdown/parse'
import { FULL_TEXT_CAP } from '@/lib/search/content-cap'
import type { SearchExtractor } from '@/core/registries/file-types'

/** The title and the conversation. Its `- [ ]` lines are quoted text, not tasks. */
const extract: SearchExtractor<string> = ({ path, data }) => {
  try {
    const doc = parseNote(path, data)
    const title =
      typeof doc.frontmatter.title === 'string' && doc.frontmatter.title
        ? doc.frontmatter.title
        : undefined
    return { title, content: doc.content.slice(0, FULL_TEXT_CAP), links: [] }
  } catch {
    return null
  }
}

export default extract
