import { parseList } from '@/lib/lists'
import type { SearchExtractor } from '@/core/registries/file-types'

/** Items and their notes. */
const extract: SearchExtractor<string> = ({ data }) => {
  try {
    const doc = parseList(data)
    const content = doc.items.flatMap((i) => (i.note ? [i.text, i.note] : [i.text])).join('\n')
    return { content, links: [] }
  } catch {
    return { content: '', links: [] }
  }
}

export default extract
