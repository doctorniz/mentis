import { SEARCH_CONTENT_CAP } from '@/lib/search/content-cap'
import type { SearchExtractor } from '@/core/registries/file-types'

/** The file body. Titles keep their extension (keepExtensionInTitle). */
const extract: SearchExtractor = async (fs, path) => {
  let content = ''
  try {
    content = await fs.readTextFile(path)
    if (content.length > SEARCH_CONTENT_CAP) content = content.slice(0, SEARCH_CONTENT_CAP)
  } catch {
    /* use empty */
  }
  return { content }
}

export default extract
