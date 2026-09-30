import { FULL_TEXT_CAP } from '@/lib/search/content-cap'
import type { SearchExtractor } from '@/core/registries/file-types'

/**
 * Text from a PPTX by parsing the Open XML slide XML: JSZip + the `<a:t>`
 * runs of each slide, in slide order. Lightweight — no editor bundle needed.
 */
async function extractPptxText(data: Uint8Array): Promise<string> {
  try {
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(data)
    const chunks: string[] = []
    let len = 0

    // Slides live at ppt/slides/slide1.xml, slide2.xml, etc.
    const slideFiles = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
      .sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)/i)?.[1] ?? '0', 10)
        const numB = parseInt(b.match(/slide(\d+)/i)?.[1] ?? '0', 10)
        return numA - numB
      })

    for (const fileName of slideFiles) {
      if (len >= FULL_TEXT_CAP) break
      const xml = await zip.files[fileName].async('text')
      const textRuns = xml.match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g) ?? []
      const slideText = textRuns.map((tag) => tag.replace(/<[^>]+>/g, '')).join(' ')
      if (slideText.trim()) {
        chunks.push(slideText.trim())
        len += slideText.length
      }
    }
    return chunks.join('\n')
  } catch {
    return ''
  }
}

const extract: SearchExtractor<Uint8Array> = async ({ data }) => ({
  content: await extractPptxText(data),
})

export default extract
