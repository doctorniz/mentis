import { extractXlsxText } from '@/lib/spreadsheet/xlsx-io'
import type { SearchExtractor } from '@/core/registries/file-types'

/** Cell values, flattened per sheet (extractXlsxText applies its own cap). */
const extract: SearchExtractor<Uint8Array> = ({ data }) => {
  let content = ''
  try {
    content = extractXlsxText(data)
  } catch {
    /* use empty */
  }
  return { content }
}

export default extract
