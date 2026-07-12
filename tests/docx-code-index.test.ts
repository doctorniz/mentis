import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { extractDocxText, isIndexableTextPath } from '@/lib/search/build-vault-index'

/** Build a minimal synthetic .docx (ZIP with word/document.xml). */
async function makeDocx(bodyXml: string): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:body>${bodyXml}</w:body></w:document>`,
  )
  return zip.generateAsync({ type: 'uint8array' })
}

describe('extractDocxText', () => {
  it('extracts text runs and joins paragraphs with newlines', async () => {
    const data = await makeDocx(
      `<w:p><w:r><w:t>Quarterly report</w:t></w:r></w:p>` +
        `<w:p><w:r><w:t>Revenue grew </w:t></w:r><w:r><w:t>12 percent</w:t></w:r></w:p>`,
    )
    const text = await extractDocxText(data)
    expect(text).toBe('Quarterly report\nRevenue grew 12 percent')
  })

  it('handles attributed <w:t> tags (xml:space)', async () => {
    const data = await makeDocx(`<w:p><w:r><w:t xml:space="preserve">hello world</w:t></w:r></w:p>`)
    expect(await extractDocxText(data)).toBe('hello world')
  })

  it('returns empty string for a zip without word/document.xml', async () => {
    const zip = new JSZip()
    zip.file('unrelated.txt', 'nope')
    const data = await zip.generateAsync({ type: 'uint8array' })
    expect(await extractDocxText(data)).toBe('')
  })

  it('returns empty string for non-zip bytes', async () => {
    expect(await extractDocxText(new Uint8Array([1, 2, 3, 4]))).toBe('')
  })
})

describe('isIndexableTextPath', () => {
  it('accepts markdown, kanban, mindmap, and code files', () => {
    expect(isIndexableTextPath('notes/todo.md')).toBe(true)
    expect(isIndexableTextPath('board.kanban')).toBe(true)
    expect(isIndexableTextPath('ideas.mind')).toBe(true)
    expect(isIndexableTextPath('src/util.ts')).toBe(true)
    expect(isIndexableTextPath('script.py')).toBe(true)
    expect(isIndexableTextPath('readme.txt')).toBe(true)
  })

  it('rejects binary types (reindexed on vault open instead)', () => {
    expect(isIndexableTextPath('report.pdf')).toBe(false)
    expect(isIndexableTextPath('deck.pptx')).toBe(false)
    expect(isIndexableTextPath('essay.docx')).toBe(false)
    expect(isIndexableTextPath('sheet.xlsx')).toBe(false)
    expect(isIndexableTextPath('sketch.canvas')).toBe(false)
    expect(isIndexableTextPath('photo.png')).toBe(false)
  })
})
