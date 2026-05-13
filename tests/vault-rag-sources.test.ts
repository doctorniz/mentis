import { describe, expect, it } from 'vitest'

import {
  mergeVaultSourcesSection,
  parseCitedSuperscriptIndices,
} from '@/lib/chat/vault-rag'

const hits = [
  {
    path: 'Notes/Arrhythmias.md',
    title: 'Cardiac rhythms',
    type: 'markdown' as const,
    score: 1,
    excerpt: '',
  },
  {
    path: 'Notes/Conduction Blocks.md',
    title: 'Bundle branch blocks',
    type: 'markdown' as const,
    score: 0.5,
    excerpt: '',
  },
]

describe('parseCitedSuperscriptIndices', () => {
  it('parses numbered sup tags', () => {
    expect(parseCitedSuperscriptIndices('A <sup>2</sup> B <sup>4</sup>')).toEqual([2, 4])
    expect(parseCitedSuperscriptIndices('<sup class="x">4</sup>')).toEqual([4])
  })
})

describe('mergeVaultSourcesSection', () => {
  it('strips any model Sources block and appends chip div with all hits', () => {
    const md = '## Answer\nHello world\n\n## Sources\n[bad](bad)\n'
    const merged = mergeVaultSourcesSection(md, hits)
    expect(merged).not.toContain('[bad](bad)')
    expect(merged).toContain('<div class="chat-sources">')
    expect(merged).toContain('href="Notes/Arrhythmias.md"')
    expect(merged).toContain('href="Notes/Conduction%20Blocks.md"')
  })

  it('always appends all hits even when body has no inline citations', () => {
    const md = '## Answer\nNo cites here.'
    const merged = mergeVaultSourcesSection(md, hits)
    expect(merged).toContain('<div class="chat-sources">')
    expect(merged).toContain('>Notes/Arrhythmias.md<')
    expect(merged).toContain('>Notes/Conduction Blocks.md<')
  })

  it('strips an existing chip div before re-appending', () => {
    const prev = 'Answer.\n\n<div class="chat-sources"><a href="old">old</a></div>\n'
    const merged = mergeVaultSourcesSection(prev, hits)
    expect(merged.match(/<div class="chat-sources">/g)?.length).toBe(1)
    expect(merged).toContain('>Notes/Arrhythmias.md<')
  })
})
