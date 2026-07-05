/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest'
import { markdownToTiptapJSON, tiptapJSONToMarkdown } from '@/lib/editor/markdown-bridge'

describe('markdownToTiptapJSON', () => {
  it('converts a heading', () => {
    const doc = markdownToTiptapJSON('# Hello World')
    expect(doc.type).toBe('doc')
    const heading = doc.content?.find((n) => n.type === 'heading')
    expect(heading).toBeDefined()
    expect(heading!.attrs?.level).toBe(1)
  })

  it('converts a paragraph', () => {
    const doc = markdownToTiptapJSON('Just a paragraph.')
    const para = doc.content?.find((n) => n.type === 'paragraph')
    expect(para).toBeDefined()
  })

  it('converts bold text', () => {
    const doc = markdownToTiptapJSON('**bold**')
    const text = doc.content?.[0]?.content?.[0]
    expect(text?.marks?.some((m) => m.type === 'bold')).toBe(true)
  })

  it('converts italic text', () => {
    const doc = markdownToTiptapJSON('*italic*')
    const text = doc.content?.[0]?.content?.[0]
    expect(text?.marks?.some((m) => m.type === 'italic')).toBe(true)
  })

  it('converts links', () => {
    const doc = markdownToTiptapJSON('[click](https://example.com)')
    const para = doc.content?.[0]
    const text = para?.content?.[0]
    expect(text?.marks?.some((m) => m.type === 'link')).toBe(true)
  })

  it('converts bullet lists', () => {
    const md = '- item one\n- item two'
    const doc = markdownToTiptapJSON(md)
    const list = doc.content?.find((n) => n.type === 'bulletList')
    expect(list).toBeDefined()
    expect(list!.content).toHaveLength(2)
  })

  it('converts ordered lists', () => {
    const md = '1. first\n2. second'
    const doc = markdownToTiptapJSON(md)
    const list = doc.content?.find((n) => n.type === 'orderedList')
    expect(list).toBeDefined()
  })

  it('converts code blocks', () => {
    const md = '```\nconst x = 1\n```'
    const doc = markdownToTiptapJSON(md)
    const cb = doc.content?.find((n) => n.type === 'codeBlock')
    expect(cb).toBeDefined()
  })

  it('converts blockquotes', () => {
    const md = '> A wise quote'
    const doc = markdownToTiptapJSON(md)
    const bq = doc.content?.find((n) => n.type === 'blockquote')
    expect(bq).toBeDefined()
  })

  it('handles empty markdown', () => {
    const doc = markdownToTiptapJSON('')
    expect(doc.type).toBe('doc')
    expect(doc.content).toBeDefined()
  })

  it('converts wiki links', () => {
    const doc = markdownToTiptapJSON('See [[My Note]]')
    const para = doc.content?.[0]
    const wikiNode = para?.content?.find((n) => n.type === 'wikiLink')
    expect(wikiNode).toBeDefined()
    expect(wikiNode!.attrs?.target).toBe('My Note')
  })

  it('converts aliased wiki links', () => {
    const doc = markdownToTiptapJSON('[[target|display]]')
    const para = doc.content?.[0]
    const wikiNode = para?.content?.find((n) => n.type === 'wikiLink')
    expect(wikiNode).toBeDefined()
    expect(wikiNode!.attrs?.target).toBe('target')
    expect(wikiNode!.attrs?.label).toBe('display')
  })

  it('converts task list into taskList node', () => {
    const md = '- [ ] todo\n- [x] done'
    const doc = markdownToTiptapJSON(md)
    const tl = doc.content?.find((n) => n.type === 'taskList')
    expect(tl).toBeDefined()
    expect(tl!.content).toHaveLength(2)
    expect(tl!.content![0]!.attrs?.checked).toBe(false)
    expect(tl!.content![1]!.attrs?.checked).toBe(true)
  })

  it('handles horizontal rule', () => {
    const doc = markdownToTiptapJSON('---')
    const hr = doc.content?.find((n) => n.type === 'horizontalRule')
    expect(hr).toBeDefined()
  })

  it('converts a GFM table', () => {
    const md = '| Name | Age |\n| --- | --- |\n| Alice | 30 |'
    const doc = markdownToTiptapJSON(md)
    const table = doc.content?.find((n) => n.type === 'table')
    expect(table).toBeDefined()
    expect(table!.content!.length).toBeGreaterThanOrEqual(2)
  })

  it('converts image ![alt](src) to image node', () => {
    const doc = markdownToTiptapJSON('![photo](_assets/pic.png)')
    const img = doc.content?.find((n) => n.type === 'image')
    expect(img).toBeDefined()
    expect(img!.attrs?.src).toBe('_assets/pic.png')
    expect(img!.attrs?.alt).toBe('photo')
  })

  it('converts ![[file.pdf#page=3]] to pdfEmbed node', () => {
    const doc = markdownToTiptapJSON('![[notes/paper.pdf#page=3]]')
    const embed = doc.content?.find((n) => n.type === 'pdfEmbed')
    expect(embed).toBeDefined()
    expect(embed!.attrs?.file).toBe('notes/paper.pdf')
    expect(embed!.attrs?.page).toBe('3')
  })

  it('converts ![[file.pdf#page=3-5]] range to pdfEmbed node', () => {
    const doc = markdownToTiptapJSON('![[doc.pdf#page=3-5]]')
    const embed = doc.content?.find((n) => n.type === 'pdfEmbed')
    expect(embed).toBeDefined()
    expect(embed!.attrs?.file).toBe('doc.pdf')
    expect(embed!.attrs?.page).toBe('3-5')
  })

  it('converts inline math $...$', () => {
    const doc = markdownToTiptapJSON('The formula $E=mc^2$ is famous.')
    const para = doc.content?.[0]
    const math = para?.content?.find((n) => n.type === 'mathInline')
    expect(math).toBeDefined()
    expect(math!.attrs?.latex).toBe('E=mc^2')
  })

  it('converts block math $$...$$', () => {
    const doc = markdownToTiptapJSON('$$\\int_0^1 x^2 dx$$')
    const mathBlock = doc.content?.find((n) => n.type === 'mathBlock')
    expect(mathBlock).toBeDefined()
    expect(mathBlock!.attrs?.latex).toContain('\\int_0^1')
  })

  it('does not treat plain dollar amounts as math', () => {
    const doc = markdownToTiptapJSON('I paid $5 and $10 more.')
    const para = doc.content?.[0]
    const math = para?.content?.find((n) => n.type === 'mathInline')
    expect(math).toBeUndefined()
  })

  it('does not treat $ around whitespace as math', () => {
    const doc = markdownToTiptapJSON('Totals: $ 5 $ and $10, $20 lined up.')
    const para = doc.content?.[0]
    const math = para?.content?.find((n) => n.type === 'mathInline')
    expect(math).toBeUndefined()
  })

  it('converts ==highlight== to a highlight mark', () => {
    const doc = markdownToTiptapJSON('This is ==important== text.')
    const para = doc.content?.[0]
    const marked = para?.content?.find((n) => n.marks?.some((m) => m.type === 'highlight'))
    expect(marked).toBeDefined()
    expect(marked?.text).toBe('important')
  })

  it('does not rewrite $, [[ ]], or ![[ ]] inside a fenced code block', () => {
    const md = '```\nconst path = "$HOME"\n// see [[not a link]] and ![[skip.pdf#page=1]]\n```'
    const doc = markdownToTiptapJSON(md)
    const cb = doc.content?.find((n) => n.type === 'codeBlock')
    expect(cb).toBeDefined()
    const text = cb!.content?.map((n) => n.text).join('\n') ?? ''
    expect(text).toContain('$HOME')
    expect(text).toContain('[[not a link]]')
    expect(text).toContain('![[skip.pdf#page=1]]')
    expect(doc.content?.some((n) => n.type === 'wikiLink')).toBe(false)
    expect(doc.content?.some((n) => n.type === 'pdfEmbed')).toBe(false)
  })

  it('does not rewrite $ or [[ ]] inside an inline code span', () => {
    const doc = markdownToTiptapJSON('Run `echo $PATH` then open [[real link]].')
    const para = doc.content?.[0]
    const code = para?.content?.find((n) => n.marks?.some((m) => m.type === 'code'))
    expect(code?.text).toBe('echo $PATH')
    const wikiNode = para?.content?.find((n) => n.type === 'wikiLink')
    expect(wikiNode).toBeDefined()
    expect(wikiNode!.attrs?.target).toBe('real link')
  })

  it('accepts H4-H6 headings', () => {
    for (const level of [4, 5, 6]) {
      const doc = markdownToTiptapJSON(`${'#'.repeat(level)} Heading ${level}`)
      const heading = doc.content?.find((n) => n.type === 'heading')
      expect(heading).toBeDefined()
      expect(heading!.attrs?.level).toBe(level)
    }
  })

  it('nests indented task-list children under their parent', () => {
    const md = '- [ ] Parent\n  - [ ] Child\n  - [x] Child done\n- [ ] Sibling'
    const doc = markdownToTiptapJSON(md)
    const tl = doc.content?.find((n) => n.type === 'taskList')
    expect(tl).toBeDefined()
    expect(tl!.content).toHaveLength(2)
    const parent = tl!.content![0]!
    const nested = parent.content?.find((n) => n.type === 'taskList')
    expect(nested).toBeDefined()
    expect(nested!.content).toHaveLength(2)
  })
})

describe('tiptapJSONToMarkdown', () => {
  it('converts a heading to markdown', () => {
    const doc = markdownToTiptapJSON('## Subtitle')
    const md = tiptapJSONToMarkdown(doc)
    expect(md).toContain('## Subtitle')
  })

  it('converts bold to markdown', () => {
    const doc = markdownToTiptapJSON('**strong**')
    const md = tiptapJSONToMarkdown(doc)
    expect(md).toContain('**strong**')
  })

  it('converts bullet list to markdown', () => {
    const doc = markdownToTiptapJSON('- alpha\n- beta')
    const md = tiptapJSONToMarkdown(doc)
    expect(md).toContain('alpha')
    expect(md).toContain('beta')
    expect(md).toMatch(/^-\s+alpha/m)
    expect(md).toMatch(/^-\s+beta/m)
  })

  it('converts wiki links back to [[syntax]]', () => {
    const doc = markdownToTiptapJSON('[[My Note]]')
    const md = tiptapJSONToMarkdown(doc)
    expect(md).toContain('[[My Note]]')
  })

  it('converts aliased wiki links back', () => {
    const doc = markdownToTiptapJSON('[[target|alias text]]')
    const md = tiptapJSONToMarkdown(doc)
    expect(md).toContain('[[target|alias text]]')
  })

  it('converts a link back without an injected title attribute', () => {
    // Regression guard: Link's HTMLAttributes are shared between the live
    // editor render and the save-direction generateHTML() call, so any
    // static title/attrs configured for editor UX (e.g. a click-to-open
    // hint) leak into every saved link as `(url "title")`.
    const doc = markdownToTiptapJSON('[click](https://example.com)')
    const md = tiptapJSONToMarkdown(doc)
    expect(md).toBe('[click](https://example.com)')
  })

  it('converts inline math back to $...$ syntax', () => {
    const doc = markdownToTiptapJSON('$E=mc^2$')
    const md = tiptapJSONToMarkdown(doc)
    expect(md).toContain('$E=mc^2$')
  })

  it('converts block math back to $$...$$ syntax', () => {
    const doc = markdownToTiptapJSON('$$x^2 + y^2 = z^2$$')
    const md = tiptapJSONToMarkdown(doc)
    expect(md).toContain('$$x^2 + y^2 = z^2$$')
  })

  it('converts task list back to - [ ] / - [x] syntax', () => {
    const doc = markdownToTiptapJSON('- [ ] todo\n- [x] done')
    const md = tiptapJSONToMarkdown(doc)
    expect(md).toContain('- [ ] todo')
    expect(md).toContain('- [x] done')
  })

  it('converts image node back to ![alt](src)', () => {
    const doc = markdownToTiptapJSON('![photo](_assets/pic.png)')
    const md = tiptapJSONToMarkdown(doc)
    expect(md).toContain('![photo](_assets/pic.png)')
  })

  it('converts pdfEmbed node back to ![[file.pdf#page=N]]', () => {
    const doc = markdownToTiptapJSON('![[paper.pdf#page=5]]')
    const md = tiptapJSONToMarkdown(doc)
    expect(md).toContain('![[paper.pdf#page=5]]')
  })

  it('converts pdfEmbed range back to ![[file.pdf#page=N-M]]', () => {
    const doc = markdownToTiptapJSON('![[doc.pdf#page=2-4]]')
    const md = tiptapJSONToMarkdown(doc)
    expect(md).toContain('![[doc.pdf#page=2-4]]')
  })

  it('converts table to GFM pipe syntax', () => {
    const md = '| Name | Age |\n| --- | --- |\n| Alice | 30 |'
    const doc = markdownToTiptapJSON(md)
    const out = tiptapJSONToMarkdown(doc)
    expect(out).toContain('|')
    expect(out).toContain('Name')
    expect(out).toContain('Alice')
    expect(out).toContain('---')
  })

  it('converts H4-H6 back to matching #### / ##### / ###### markdown', () => {
    for (const level of [4, 5, 6]) {
      const doc = markdownToTiptapJSON(`${'#'.repeat(level)} Heading ${level}`)
      const md = tiptapJSONToMarkdown(doc)
      expect(md).toContain(`${'#'.repeat(level)} Heading ${level}`)
    }
  })

  it('converts a nested task list back to indented markdown', () => {
    const doc = markdownToTiptapJSON('- [ ] Parent\n  - [ ] Child')
    const md = tiptapJSONToMarkdown(doc)
    expect(md).toMatch(/^- \[ \] Parent\n {2}- \[ \] Child$/m)
  })

  it('converts a highlight mark back to ==text==', () => {
    const doc = markdownToTiptapJSON('This is ==important== text.')
    const md = tiptapJSONToMarkdown(doc)
    expect(md).toContain('==important==')
  })
})

describe('round-trip: markdown → JSON → markdown', () => {
  const cases = [
    { name: 'heading', md: '# Title' },
    { name: 'bold text', md: '**bold**' },
    { name: 'italic text', md: '*italic*' },
    { name: 'bullet list', md: '- one\n- two\n- three' },
    { name: 'ordered list', md: '1. first\n2. second' },
    { name: 'blockquote', md: '> Quote' },
    { name: 'code block', md: '```\ncode\n```' },
    { name: 'link', md: '[text](https://example.com)' },
    { name: 'wiki link', md: '[[My Note]]' },
    { name: 'aliased wiki link', md: '[[target|display]]' },
    { name: 'horizontal rule', md: '---' },
    { name: 'task list', md: '- [ ] todo\n- [x] done' },
    { name: 'image', md: '![alt text](_assets/photo.png)' },
    { name: 'pdf embed', md: '![[paper.pdf#page=3]]' },
    { name: 'pdf embed range', md: '![[doc.pdf#page=1-3]]' },
    { name: 'h4 heading', md: '#### Section' },
    { name: 'h5 heading', md: '##### Subsection' },
    { name: 'h6 heading', md: '###### Detail' },
    {
      name: 'nested task list',
      md: '- [ ] Parent\n  - [ ] Child\n  - [x] Child done\n- [ ] Sibling',
    },
    {
      name: 'code block with $ and [[ ]] literals',
      md: '```\nconst path = "$HOME"\n// [[not a link]] and ![[skip.pdf#page=1]]\n```',
    },
    { name: 'inline code with $ literal', md: 'Run `echo $PATH` please.' },
    { name: 'plain dollar amounts', md: 'I paid $5 and $10 more.' },
    { name: 'strikethrough', md: '~~gone~~' },
    { name: 'highlight', md: 'This is ==important== text.' },
    { name: 'mixed bold and italic', md: '**bold *and italic* text**' },
    { name: 'multi-row table', md: '| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |' },
    { name: 'ordered list with 3+ items', md: '1. first\n2. second\n3. third' },
    { name: 'nested bullet list', md: '- one\n  - nested one\n  - nested two\n- two' },
    { name: 'multi-paragraph blockquote', md: '> Line one\n>\n> Line two' },
  ]

  for (const { name, md } of cases) {
    it(`preserves ${name}`, () => {
      const json = markdownToTiptapJSON(md)
      const result = tiptapJSONToMarkdown(json)
      const doc2 = markdownToTiptapJSON(result)
      const result2 = tiptapJSONToMarkdown(doc2)
      expect(result2).toBe(result)
    })
  }
})
