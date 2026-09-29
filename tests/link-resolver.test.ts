import { describe, it, expect } from 'vitest'
import { createWikiLinkResolver, resolveWikiLinkPath } from '@/lib/markdown'
import { resolveLinkEdges } from '@/lib/links/resolve-edges'

const PATHS = [
  'Work/Project Plan.md',
  'Work/meeting-notes.md',
  'Personal/my_note.md',
  'Personal/Board.kan.md',
  'Ideas/Map.map.md',
  'Deck.slides.md',
  'Reading/paper.pdf',
  'Reading/Project Plan.pdf',
]

const LINKS = [
  'Project Plan',
  'project-plan',
  'my note',
  'Meeting Notes',
  'Board',
  'Map',
  'Deck',
  'paper',
  'Work/meeting',
  'reading',
  'nothing at all',
  '',
]

describe('createWikiLinkResolver', () => {
  it('gives the same answer as resolveWikiLinkPath for every link', () => {
    const resolve = createWikiLinkResolver(PATHS)
    for (const link of LINKS) expect(resolve(link), link).toBe(resolveWikiLinkPath(link, PATHS))
  })

  it('prefers the first path when several share a name', () => {
    expect(createWikiLinkResolver(PATHS)('Project Plan')).toBe('Work/Project Plan.md')
  })

  it('answers repeat lookups the same way', () => {
    const resolve = createWikiLinkResolver(PATHS)
    expect(resolve('nothing at all')).toBeNull()
    expect(resolve('nothing at all')).toBeNull()
    expect(resolve('paper')).toBe(resolve('paper'))
  })
})

describe('resolveLinkEdges', () => {
  const notes = ['a.md', 'b.md', 'c.md']

  it('resolves written targets to paths, once per pair', () => {
    const edges = resolveLinkEdges(
      [
        { source: 'a.md', target: 'b' },
        { source: 'a.md', target: 'B' },
        { source: 'b.md', target: 'c' },
      ],
      notes,
    )
    expect(edges).toEqual([
      { source: 'a.md', target: 'b.md' },
      { source: 'b.md', target: 'c.md' },
    ])
  })

  it('drops self-links and links that resolve to nothing', () => {
    expect(
      resolveLinkEdges(
        [
          { source: 'a.md', target: 'a' },
          { source: 'a.md', target: 'zzz' },
        ],
        notes,
      ),
    ).toEqual([])
  })

  it('ignores links written in files outside the given paths', () => {
    expect(resolveLinkEdges([{ source: 'other.md', target: 'a' }], notes)).toEqual([])
  })

  it('does not link to files outside the given paths', () => {
    expect(resolveLinkEdges([{ source: 'a.md', target: 'hidden' }], ['a.md'])).toEqual([])
  })
})
