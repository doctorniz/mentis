/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest'
import { markdownToTiptapJSON } from '@/lib/editor/markdown-bridge'
import { buildExportHtml } from '@/lib/notes/export-pdf'

describe('buildExportHtml', () => {
  it('wraps content in a full HTML document', async () => {
    const doc = markdownToTiptapJSON('# Hello World')
    const html = await buildExportHtml(doc, 'Test Note')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<title>Test Note</title>')
    expect(html).toContain('<article>')
    expect(html).toContain('Hello World')
  })

  it('includes print-ready CSS', async () => {
    const doc = markdownToTiptapJSON('paragraph')
    const html = await buildExportHtml(doc, 'Styled')
    expect(html).toContain('<style>')
    expect(html).toContain('@media print')
  })

  it('renders headings correctly', async () => {
    const doc = markdownToTiptapJSON('# H1\n## H2\n### H3')
    const html = await buildExportHtml(doc, 'Headings')
    expect(html).toContain('<h1>H1</h1>')
    expect(html).toContain('<h2>H2</h2>')
    expect(html).toContain('<h3>H3</h3>')
  })

  it('renders bold and italic', async () => {
    const doc = markdownToTiptapJSON('**bold** and *italic*')
    const html = await buildExportHtml(doc, 'Formatting')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>italic</em>')
  })

  it('renders bullet lists', async () => {
    const doc = markdownToTiptapJSON('- alpha\n- beta')
    const html = await buildExportHtml(doc, 'Lists')
    expect(html).toContain('<ul>')
    expect(html).toContain('alpha')
    expect(html).toContain('beta')
  })

  it('renders code blocks', async () => {
    const doc = markdownToTiptapJSON('```\nconst x = 1\n```')
    const html = await buildExportHtml(doc, 'Code')
    expect(html).toContain('<pre>')
    expect(html).toContain('const x = 1')
  })

  it('renders images with src', async () => {
    const doc = markdownToTiptapJSON('![photo](_assets/pic.png)')
    const html = await buildExportHtml(doc, 'Images')
    expect(html).toContain('<img')
    expect(html).toContain('_assets/pic.png')
  })

  it('renders task lists', async () => {
    const doc = markdownToTiptapJSON('- [ ] todo\n- [x] done')
    const html = await buildExportHtml(doc, 'Tasks')
    expect(html).toContain('taskList')
    expect(html).toContain('todo')
    expect(html).toContain('done')
  })

  it('escapes title in HTML', async () => {
    const doc = markdownToTiptapJSON('text')
    const html = await buildExportHtml(doc, 'Note <script>alert(1)</script>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
