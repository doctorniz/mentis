import { describe, it, expect } from 'vitest'
import { runExtractor } from '@/core/index/extract'
import { extractLinkTargets } from '@/lib/markdown/parse'

describe('extractLinkTargets', () => {
  it('lists distinct targets in order of first appearance', () => {
    expect(extractLinkTargets('[[b]] then [[a]] and [[b]] again')).toEqual(['b', 'a'])
  })

  it('takes the target of an aliased link', () => {
    expect(extractLinkTargets('see [[Project Plan|the plan]]')).toEqual(['Project Plan'])
  })

  it('is empty without links', () => {
    expect(extractLinkTargets('nothing here')).toEqual([])
  })
})

describe('extractors report the links a file makes', () => {
  const body = 'See [[Alpha]] and [[Beta]].'

  it('markdown', async () => {
    const out = await runExtractor({ typeId: 'markdown', path: 'n.md', data: `# N\n${body}` })
    expect(out?.links).toEqual(['Alpha', 'Beta'])
  })

  it('markdown links in front matter and body are both seen in the raw text', async () => {
    const out = await runExtractor({
      typeId: 'markdown',
      path: 'n.md',
      data: `---\ntitle: T\n---\n${body}`,
    })
    expect(out?.links).toEqual(['Alpha', 'Beta'])
  })

  it('slides', async () => {
    const out = await runExtractor({
      typeId: 'slides',
      path: 'd.slides.md',
      data: `---\nmarp: true\n---\n\n# One\n\n${body}\n\n---\n\n# Two\n\n[[Alpha]]`,
    })
    expect(out?.links).toEqual(['Alpha', 'Beta'])
  })

  it('kanban', async () => {
    const out = await runExtractor({
      typeId: 'kanban',
      path: 'b.kan.md',
      data: `---\nkanban-plugin: board\n---\n\n## Todo\n\n- [ ] ${body}\n`,
    })
    expect(out?.links).toEqual(['Alpha', 'Beta'])
  })

  it('mindmap', async () => {
    const out = await runExtractor({
      typeId: 'mindmap',
      path: 'm.map.md',
      data: `# Root\n- ${body}\n`,
    })
    expect(out?.links).toEqual(['Alpha', 'Beta'])
  })
})
