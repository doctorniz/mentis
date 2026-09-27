import { parseKanban } from '@/lib/kanban'
import type { SearchExtractor } from '@/core/registries/file-types'

/** Column headings and card titles. */
const extract: SearchExtractor = async (fs, path) => {
  let content = ''
  try {
    const { board } = parseKanban(await fs.readTextFile(path))
    content = board.columns
      .flatMap((col) => [col.heading, ...col.cards.map((c) => c.title)])
      .join('\n')
  } catch {
    /* use empty */
  }
  return { content }
}

export default extract
