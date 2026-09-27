import { loadPdfjs } from '@/lib/pdf/pdfjs-loader'
import { SEARCH_CONTENT_CAP } from '@/lib/search/content-cap'
import type { SearchExtractor } from '@/core/registries/file-types'

async function extractPdfText(data: Uint8Array): Promise<string> {
  try {
    const pdfjs = await loadPdfjs()
    const doc = await pdfjs.getDocument({ data }).promise
    const chunks: string[] = []
    let len = 0
    for (let i = 1; i <= doc.numPages && len < SEARCH_CONTENT_CAP; i++) {
      const page = await doc.getPage(i)
      const tc = await page.getTextContent()
      const pageText = tc.items
        .filter((it) => 'str' in it)
        .map((it) => (it as { str: string }).str)
        .join(' ')
      chunks.push(pageText)
      len += pageText.length
    }
    return chunks.join('\n')
  } catch {
    return ''
  }
}

/** Page text via PDF.js, and the document's Title metadata when set. */
const extract: SearchExtractor = async (fs, path) => {
  let content = ''
  let title: string | undefined
  try {
    const data = await fs.readFile(path)
    content = await extractPdfText(data)
    if (content.length > SEARCH_CONTENT_CAP) content = content.slice(0, SEARCH_CONTENT_CAP)

    const pdfjs = await loadPdfjs()
    const doc = await pdfjs.getDocument({ data }).promise
    const meta = await doc.getMetadata().catch(() => null)
    const infoTitle = (meta?.info as Record<string, unknown> | undefined)?.Title
    if (typeof infoTitle === 'string' && infoTitle.trim()) title = infoTitle.trim()
  } catch {
    /* use defaults */
  }
  return { title, content }
}

export default extract
