import { loadPdfjs } from '@/lib/pdf/pdfjs-loader'
import { FULL_TEXT_CAP } from '@/lib/search/content-cap'
import type { SearchExtractor } from '@/core/registries/file-types'

async function extractPdfText(data: Uint8Array): Promise<string> {
  try {
    const pdfjs = await loadPdfjs()
    const doc = await pdfjs.getDocument({ data }).promise
    const chunks: string[] = []
    let len = 0
    for (let i = 1; i <= doc.numPages && len < FULL_TEXT_CAP; i++) {
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
const extract: SearchExtractor<Uint8Array> = async ({ data }) => {
  let content = ''
  let title: string | undefined
  try {
    content = await extractPdfText(data)
    if (content.length > FULL_TEXT_CAP) content = content.slice(0, FULL_TEXT_CAP)

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
