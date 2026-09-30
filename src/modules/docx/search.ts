import { FULL_TEXT_CAP } from '@/lib/search/content-cap'
import type { SearchExtractor } from '@/core/registries/file-types'

/**
 * Text from a DOCX by parsing the Open XML body: JSZip + the `<w:t>` runs,
 * with `</w:p>` paragraph ends becoming newlines. Exported for tests.
 */
export async function extractDocxText(data: Uint8Array): Promise<string> {
  try {
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(data)
    const docXml = zip.files['word/document.xml']
    if (!docXml) return ''
    const xml = await docXml.async('text')

    const paragraphs = xml.split(/<\/w:p>/)
    const chunks: string[] = []
    let len = 0
    for (const para of paragraphs) {
      if (len >= FULL_TEXT_CAP) break
      const textRuns = para.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) ?? []
      const text = textRuns
        .map((tag) => tag.replace(/<[^>]+>/g, ''))
        .join('')
        .trim()
      if (text) {
        chunks.push(text)
        len += text.length
      }
    }
    return chunks.join('\n')
  } catch {
    return ''
  }
}

const extract: SearchExtractor<Uint8Array> = async ({ data }) => {
  const content = await extractDocxText(data)
  return {
    content: content.length > FULL_TEXT_CAP ? content.slice(0, FULL_TEXT_CAP) : content,
  }
}

export default extract
