import { describe, expect, it } from 'vitest'

import { preprocessChatMarkdown, renderChatMarkdown } from '@/lib/chat/render-markdown'

describe('preprocessChatMarkdown', () => {
  it('appends a deduped chat-sources chip list for vault backtick paths', () => {
    const md = 'Hello `Notes/A.md` and `Notes/B.md` again `Notes/A.md`.'
    const pre = preprocessChatMarkdown(md)
    expect(pre).toContain('<div class="chat-sources">')
    expect(pre).toContain('<a href="Notes/A.md">Notes/A.md</a>')
    expect(pre).toContain('<a href="Notes/B.md">Notes/B.md</a>')
    // Deduped — Notes/A.md is repeated in the body but should only produce one chip.
    const chipCount = pre.match(/<a href="Notes\/A\.md">/g)?.length ?? 0
    expect(chipCount).toBe(1)
  })

  it('does not append Sources when already present', () => {
    const md = 'Hi `Notes/A.md`.\n\n## Sources\n\n1. [`Notes/A.md`](Notes/A.md)\n'
    const pre = preprocessChatMarkdown(md)
    const count = pre.match(/## Sources/g)?.length ?? 0
    expect(count).toBe(1)
  })

  it('keeps standalone thematic break lines untouched', () => {
    const md = 'A\n\n---\n\nB'
    const pre = preprocessChatMarkdown(md)
    expect(pre).toMatch(/^\s*---\s*$/m)
    expect(pre).toContain('A')
    expect(pre).toContain('B')
  })
})

// Rendered HTML (vault links, link targets, sanitising) needs DOMPurify in a
// real browser — happy-dom does not sanitise — so it is checked end to end in
// `tests/e2e/31-sanitize.spec.ts`.
describe('renderChatMarkdown', () => {
  it('without a DOM to sanitise in, returns escaped text', () => {
    const html = renderChatMarkdown('Hi <img src=x onerror=alert(1)>')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })
})
