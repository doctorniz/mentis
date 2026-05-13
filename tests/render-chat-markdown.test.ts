import { describe, expect, it } from 'vitest'

import {
  preprocessChatMarkdown,
  renderChatMarkdown,
} from '@/lib/chat/render-markdown'

describe('preprocessChatMarkdown', () => {
  it('maps vault backtick paths to superscripts and appends Sources', () => {
    const md = 'Hello `Notes/A.md` and `Notes/B.md` again `Notes/A.md`.'
    const pre = preprocessChatMarkdown(md)
    expect(pre).toContain('<sup class="chat-ref">1</sup>')
    expect(pre).toContain('<sup class="chat-ref">2</sup>')
    expect(pre).toMatch(/## Sources/)
    expect(pre).toContain('Notes/A.md')
    expect(pre).toContain('Notes/B.md')
  })

  it('does not append Sources when already present', () => {
    const md =
      'Hi `Notes/A.md`.\n\n## Sources\n\n1. [`Notes/A.md`](Notes/A.md)\n'
    const pre = preprocessChatMarkdown(md)
    const count = pre.match(/## Sources/g)?.length ?? 0
    expect(count).toBe(1)
  })

  it('removes standalone thematic break lines', () => {
    const md = 'A\n\n---\n\nB'
    const pre = preprocessChatMarkdown(md)
    expect(pre).not.toMatch(/^\s*---\s*$/m)
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
