import { parseMindmap, extractMindmapText } from '@/lib/mindmap'
import type { SearchExtractor } from '@/core/registries/file-types'

/** Node labels. */
const extract: SearchExtractor = async (fs, path) => {
  let content = ''
  try {
    content = extractMindmapText(parseMindmap(await fs.readTextFile(path)))
  } catch {
    /* use empty */
  }
  return { content }
}

export default extract
