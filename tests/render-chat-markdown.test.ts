import { describe, expect, it } from 'vitest'

import {
  preprocessChatMarkdown,
  renderChatMarkdown,
} from '@/lib/chat/render-markdown'

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
    const md =
      'Hi `Notes/A.md`.\n\n## Sources\n\n1. [`Notes/A.md`](Notes/A.md)\n'
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

describe('renderChatMarkdown', () => {
  it('rewrites relative vault links for in-app handling', () => {
    const html = renderChatMarkdown('[Notes/X.md](Notes/X.md)')
    expect(html).toContain('data-ink-path')
    expect(html).toContain('chat-vault-source')
    expect(html).toContain('Notes/X.md')
    expect(html).not.toContain('target="_blank"')
  })

  it('keeps external http links', () => {
    const html = renderChatMarkdown('[x](https://example.com)')
    expect(html).toContain('https://example.com')
    expect(html).toContain('target="_blank"')
  })
})
