import { parseKanban } from '@/lib/kanban'
import type { SearchExtractor } from '@/core/registries/file-types'

/** Column headings and card titles. */
const extract: SearchExtractor<string> = ({ data }) => {
  let content = ''
  try {
    const { board } = parseKanban(data)
    content = board.columns
      .flatMap((col) => [col.heading, ...col.cards.map((c) => c.title)])
      .join('\n')
  } catch {
    /* use empty */
  }
  return { content }
}

export default extract
