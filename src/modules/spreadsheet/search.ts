import { extractXlsxText } from '@/lib/spreadsheet/xlsx-io'
import { FULL_TEXT_CAP } from '@/lib/search/content-cap'
import type { SearchExtractor } from '@/core/registries/file-types'

/** Cell values, flattened per sheet (up to FULL_TEXT_CAP). */
const extract: SearchExtractor<Uint8Array> = ({ data }) => {
  let content = ''
  try {
    content = extractXlsxText(data, FULL_TEXT_CAP)
  } catch {
    /* use empty */
  }
  return { content }
}

export default extract
