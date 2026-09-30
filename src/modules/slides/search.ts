import { extractLinkTargets, parseNote } from '@/lib/markdown/parse'
import { FULL_TEXT_CAP } from '@/lib/search/content-cap'
import type { SearchExtractor } from '@/core/registries/file-types'

/** The deck's markdown without front matter; its `title` directive if set. */
const extract: SearchExtractor<string> = ({ path, data }) => {
  const links = extractLinkTargets(data)
  try {
    const doc = parseNote(path, data)
    const title =
      typeof doc.frontmatter.title === 'string' && doc.frontmatter.title
        ? doc.frontmatter.title
        : undefined
    const content =
      doc.content.length > FULL_TEXT_CAP ? doc.content.slice(0, FULL_TEXT_CAP) : doc.content
    return { title, content, links }
  } catch {
    return { content: '', links }
  }
}

export default extract
