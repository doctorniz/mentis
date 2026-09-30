import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import type { FileSystemAdapter } from '@/lib/fs'
import { canConvert, convertLabel, convertVaultFile, freePath } from '@/core/convert/convert-file'
import convertDocx, { htmlToMarkdown } from '@/modules/docx/convert'
import convertPptx, { pptxToSlidesMarkdown } from '@/modules/pptx/convert'

const PNG_1X1 = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
)

async function makeDocx(body: string, withImage = false): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Default Extension="png" ContentType="image/png"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
      `</Types>`,
  )
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  )
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      (withImage
        ? `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/pic.png"/>`
        : '') +
      `</Relationships>`,
  )
  zip.file(
    'word/styles.xml',
    `<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`,
  )
  if (withImage) zip.file('word/media/pic.png', PNG_1X1)
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?>` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
      `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
      `xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ` +
      `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
      `xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
      `<w:body>${body}</w:body></w:document>`,
  )
  return zip.generateAsync({ type: 'uint8array' })
}

const IMAGE_RUN =
  `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="100" cy="100"/><wp:docPr id="1" name="pic" descr="A dot"/>` +
  `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>` +
  `<pic:blipFill><a:blip r:embed="rId2"/></pic:blipFill></pic:pic></a:graphicData></a:graphic>` +
  `</wp:inline></w:drawing></w:r></w:p>`

describe('convertDocx', () => {
  it('turns headings, emphasis and paragraphs into Markdown', async () => {
    const data = await makeDocx(
      `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Quarterly report</w:t></w:r></w:p>` +
        `<w:p><w:r><w:t xml:space="preserve">Revenue </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>grew</w:t></w:r></w:p>`,
    )
    const out = await convertDocx({ data, title: 'Report', saveAsset: async () => 'unused' })
    expect(out.suffix).toBe('.md')
    expect(out.content).toContain('# Quarterly report')
    expect(out.content).toContain('Revenue **grew**')
    expect(out.content.endsWith('\n')).toBe(true)
  })

  it('writes images through saveAsset and links them by vault path', async () => {
    const data = await makeDocx(IMAGE_RUN, true)
    const saved: { name: string; bytes: number }[] = []
    const out = await convertDocx({
      data,
      title: 'Report',
      saveAsset: async (name, bytes) => {
        saved.push({ name, bytes: bytes.length })
        return `_assets/${name}`
      },
    })
    expect(saved).toHaveLength(1)
    expect(saved[0].name).toBe('Report-image-1.png')
    expect(saved[0].bytes).toBe(PNG_1X1.length)
    expect(out.content).toContain('_assets/Report-image-1.png')
  })
})

describe('htmlToMarkdown', () => {
  it('renders lists, links and tables', async () => {
    const md = await htmlToMarkdown(
      '<ul><li>one</li><li>two</li></ul><p><a href="https://x.test">x</a></p>' +
        '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>',
    )
    expect(md).toContain('- one')
    expect(md).toContain('- two')
    expect(md).toContain('[x](https://x.test)')
    expect(md).toContain('| A | B |')
    expect(md).toContain('| --- | --- |')
    expect(md).toContain('| 1 | 2 |')
  })
})

const NS =
  `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
  `xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ` +
  `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`

const run = (t: string, rPr = '') => `<a:r><a:rPr${rPr}/><a:t>${t}</a:t></a:r>`

function slideXml(shapes: string): string {
  return `<?xml version="1.0"?><p:sld ${NS}><p:cSld><p:spTree>${shapes}</p:spTree></p:cSld></p:sld>`
}

function titleShape(text: string, type = 'title'): string {
  return `<p:sp><p:nvSpPr><p:nvPr><p:ph type="${type}"/></p:nvPr></p:nvSpPr><p:txBody><a:p>${run(text)}</a:p></p:txBody></p:sp>`
}

async function makePptx(): Promise<Uint8Array> {
  const zip = new JSZip()
  // Slide files are numbered opposite to their presentation order.
  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0"?><p:presentation ${NS}><p:sldIdLst>` +
      `<p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId1"/></p:sldIdLst></p:presentation>`,
  )
  zip.file(
    'ppt/_rels/presentation.xml.rels',
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="x/slide" Target="slides/slide1.xml"/>` +
      `<Relationship Id="rId2" Type="x/slide" Target="slides/slide2.xml"/></Relationships>`,
  )
  zip.file('ppt/slides/slide2.xml', slideXml(titleShape('Launch plan', 'ctrTitle')))
  zip.file(
    'ppt/slides/slide1.xml',
    slideXml(
      titleShape('Risks') +
        `<p:sp><p:nvSpPr><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:txBody>` +
        `<a:p>${run('Budget', ' b="1"')}</a:p>` +
        `<a:p><a:pPr lvl="1"/>${run('Travel')}</a:p></p:txBody></p:sp>` +
        `<p:graphicFrame><a:graphic><a:graphicData><a:tbl>` +
        `<a:tr><a:tc><a:txBody><a:p>${run('Who')}</a:p></a:txBody></a:tc><a:tc><a:txBody><a:p>${run('What')}</a:p></a:txBody></a:tc></a:tr>` +
        `<a:tr><a:tc><a:txBody><a:p>${run('Ana')}</a:p></a:txBody></a:tc><a:tc><a:txBody><a:p>${run('Plan')}</a:p></a:txBody></a:tc></a:tr>` +
        `</a:tbl></a:graphicData></a:graphic></p:graphicFrame>` +
        `<p:pic><p:blipFill/></p:pic>`,
    ),
  )
  zip.file(
    'ppt/slides/_rels/slide1.xml.rels',
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>`,
  )
  zip.file(
    'ppt/notesSlides/notesSlide1.xml',
    `<?xml version="1.0"?><p:notes ${NS}><p:cSld><p:spTree>` +
      `<p:sp><p:nvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:txBody><a:p>${run('Say this first')}</a:p></p:txBody></p:sp>` +
      `</p:spTree></p:cSld></p:notes>`,
  )
  return zip.generateAsync({ type: 'uint8array' })
}

describe('pptxToSlidesMarkdown', () => {
  it('produces a Marp deck in presentation order', async () => {
    const { content, skippedImages } = await pptxToSlidesMarkdown(await makePptx(), 'Talk')
    expect(content.startsWith('---\nmarp: true\ntitle: "Talk"\npaginate: true\n---\n')).toBe(true)
    const slides = content.split('\n---\n').slice(1)
    expect(slides).toHaveLength(2)
    expect(slides[0]).toContain('# Launch plan')
    expect(slides[1]).toContain('## Risks')
    expect(skippedImages).toBe(1)
  })

  it('keeps bullets, nesting, bold, tables and speaker notes', async () => {
    const { content } = await pptxToSlidesMarkdown(await makePptx(), 'Talk')
    expect(content).toContain('- **Budget**\n  - Travel')
    expect(content).toContain('| Who | What |\n| --- | --- |\n| Ana | Plan |')
    expect(content).toContain('<!--\nSay this first\n-->')
  })

  it('reports skipped images as a warning', async () => {
    const out = await convertPptx({
      data: await makePptx(),
      title: 'Talk',
      saveAsset: async () => 'unused',
    })
    expect(out.suffix).toBe('.slides.md')
    expect(out.warning).toMatch(/1 image/)
  })
})

describe('freePath', () => {
  it('uses the plain name when free and numbers collisions', async () => {
    const taken = new Set(['a/Report.md', 'a/Report 2.md'])
    const exists = async (p: string) => taken.has(p)
    expect(await freePath('a/', 'Report', '.md', exists)).toBe('a/Report 3.md')
    expect(await freePath('a/', 'Other', '.md', exists)).toBe('a/Other.md')
    expect(await freePath('', 'Report', '.md', exists)).toBe('Report.md')
  })
})

describe('registry convertTo', () => {
  it('is offered for docx and pptx only', () => {
    expect(canConvert('x/Report.docx')).toBe(true)
    expect(canConvert('Talk.pptx')).toBe(true)
    expect(canConvert('Sheet.xlsx')).toBe(false)
    expect(canConvert('Note.md')).toBe(false)
    expect(convertLabel('Report.docx')).toBe('Convert to Markdown')
    expect(convertLabel('Talk.pptx')).toBe('Convert to slides')
  })
})

describe('convertVaultFile', () => {
  function fakeFs(initial: Record<string, Uint8Array>) {
    const files = new Map(Object.entries(initial))
    const fs = {
      readFile: async (p: string) => {
        const f = files.get(p)
        if (!f) throw new Error(`missing ${p}`)
        return f
      },
      exists: async (p: string) => files.has(p),
      mkdir: async () => {},
      writeFile: async (p: string, d: Uint8Array) => void files.set(p, d),
      writeTextFile: async (p: string, c: string) => void files.set(p, new TextEncoder().encode(c)),
    } as unknown as FileSystemAdapter
    return { fs, files }
  }

  it('writes a sibling file, leaves the original alone and never overwrites', async () => {
    const original = await makePptx()
    const { fs, files } = fakeFs({
      'Decks/Talk.pptx': original,
      'Decks/Talk.slides.md': new TextEncoder().encode('mine'),
    })
    const events: string[] = []
    const onChange = () => events.push('changed')
    globalThis.window = Object.assign(globalThis.window ?? {}, {
      dispatchEvent: () => (onChange(), true),
    }) as typeof globalThis.window

    const result = await convertVaultFile(fs, 'Decks/Talk.pptx')
    expect(result.path).toBe('Decks/Talk 2.slides.md')
    expect(new TextDecoder().decode(files.get('Decks/Talk.slides.md'))).toBe('mine')
    expect(files.get('Decks/Talk.pptx')).toBe(original)
    expect(new TextDecoder().decode(files.get(result.path))).toContain('marp: true')
    expect(events).toEqual(['changed'])
  })

  it('refuses types without a converter', async () => {
    const { fs } = fakeFs({ 'a.xlsx': new Uint8Array() })
    await expect(convertVaultFile(fs, 'a.xlsx')).rejects.toThrow()
  })
})
