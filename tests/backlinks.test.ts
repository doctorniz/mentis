import { describe, it, expect } from 'vitest'
import { backlinksFor } from '@/lib/notes/backlinks'

describe('backlinksFor', () => {
  const edges = [
    { source: 'notes/zebra.md', target: 'target.md' },
    { source: 'Apple.md', target: 'target.md' },
    { source: 'notes/mango.md', target: 'other.md' },
    { source: 'target.md', target: 'other.md' },
  ]

  it('lists notes that link to the target, by title', () => {
    expect(backlinksFor(edges, 'target.md')).toEqual([
      { path: 'Apple.md', title: 'Apple' },
      { path: 'notes/zebra.md', title: 'zebra' },
    ])
  })

  it('is empty when nothing links there', () => {
    expect(backlinksFor(edges, 'lonely.md')).toEqual([])
  })
})
