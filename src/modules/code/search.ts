import { FULL_TEXT_CAP } from '@/lib/search/content-cap'
import type { SearchExtractor } from '@/core/registries/file-types'

/** The file body. Titles keep their extension (keepExtensionInTitle). */
const extract: SearchExtractor<string> = ({ data }) => ({
  content: data.length > FULL_TEXT_CAP ? data.slice(0, FULL_TEXT_CAP) : data,
})

export default extract
