import { SEARCH_CONTENT_CAP } from '@/lib/search/content-cap'
import type { SearchExtractor } from '@/core/registries/file-types'

/** The file body. Titles keep their extension (keepExtensionInTitle). */
const extract: SearchExtractor<string> = ({ data }) => ({
  content: data.length > SEARCH_CONTENT_CAP ? data.slice(0, SEARCH_CONTENT_CAP) : data,
})

export default extract
