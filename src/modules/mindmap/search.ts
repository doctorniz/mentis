import { parseMindmap, extractMindmapText } from '@/lib/mindmap'
import type { SearchExtractor } from '@/core/registries/file-types'

/** Node labels. */
const extract: SearchExtractor<string> = ({ data }) => {
  let content = ''
  try {
    content = extractMindmapText(parseMindmap(data))
  } catch {
    /* use empty */
  }
  return { content }
}

export default extract
