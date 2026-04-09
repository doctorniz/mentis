import { describe, it, expect } from 'vitest'
import {
  parseNote,
  serializeNote,
  extractWikiLinks,
  extractTags,
  resolveWikiLinkPath,
} from '@/lib/markdown'

describe('parseNote', () => {
  it('parses frontmatter and content', () => {
    const raw = `---
title: Hello
tags: [idea, draft]
---
# Heading

Body text here.`
    const doc = parseNote('notes/hello.md', raw)
    expect(doc.path).toBe('notes/hello.md')
    expect(doc.frontmatter.title).toBe('Hello')
    expect(doc.frontmatter.tags).toEqual(['idea', 'draft'])
    expect(doc.content).toContain('# Heading')
    expect(doc.content).toContain('Body text here.')
    expect(doc.rawContent).toBe(raw)
  })

  it('handles note with no frontmatter', () => {
    const raw = 'Just some plain text.'
    const doc = parseNote('plain.md', raw)
    expect(doc.frontmatter).toEqual({})
    expect(doc.content).toBe('Just some plain text.')
  })

  it('handles empty string', () => {
    const doc = parseNote('empty.md', '')
    expect(doc.content).toBe('')
    expect(doc.frontmatter).toEqual({})
  })

  it('preserves arbitrary frontmatter keys', () => {
    const raw = `---
title: Test
custom_key: custom_value
---
body`
    const doc = parseNote('test.md', raw)
    expect(doc.frontmatter['custom_key']).toBe('custom_value')
  })
})

describe('serializeNote', () => {
  it('round-trips frontmatter through parse → serialize', () => {
    const fm = { title: 'My Note', tags: ['a', 'b'] }
    const content = '# Hello\n\nWorld'
    const serialized = serializeNote(fm, content)
    expect(serialized).toContain('title: My Note')
    expect(serialized).toContain('# Hello')
    expect(serialized).toContain('World')
    expect(serialized).toContain('modified:')
  })

  it('adds modified timestamp', () => {
    const before = Date.now()
    const serialized = serializeNote({}, 'body')
    const doc = parseNote('x.md', serialized)
    const modified = new Date(doc.frontmatter.modified as string).getTime()
    expect(modified).toBeGreaterThanOrEqual(before - 1000)
    expect(modified).toBeLessThanOrEqual(Date.now() + 1000)
  })
})

describe('extractWikiLinks', () => {
  it('extracts simple wiki links', () => {
    const links = extractWikiLinks('See [[My Note]] and [[Other]].')
    expect(links).toHaveLength(2)
    expect(links[0]).toEqual({ target: 'My Note' })
    expect(links[1]).toEqual({ target: 'Other' })
  })

  it('extracts aliased wiki links', () => {
    const links = extractWikiLinks('[[target|display text]]')
    expect(links).toHaveLength(1)
    expect(links[0]).toEqual({ target: 'target', alias: 'display text' })
  })

  it('extracts page references', () => {
    const links = extractWikiLinks('[[paper.pdf#page=5]]')
    expect(links).toHaveLength(1)
    expect(links[0]).toEqual({ target: 'paper.pdf', pageRef: '5' })
  })

  it('extracts page range references', () => {
    const links = extractWikiLinks('[[doc.pdf#page=3-7]]')
    expect(links).toHaveLength(1)
    expect(links[0]).toEqual({ target: 'doc.pdf', pageRef: '3-7' })
  })

  it('returns empty array for no links', () => {
    expect(extractWikiLinks('no links here')).toEqual([])
  })

  it('handles multiple links on same line', () => {
    const links = extractWikiLinks('[[A]] then [[B]] then [[C]]')
    expect(links).toHaveLength(3)
  })

  it('handles aliased page ref', () => {
    const links = extractWikiLinks('[[paper.pdf#page=2|Page 2 of Paper]]')
    expect(links).toHaveLength(1)
    expect(links[0]!.alias).toBe('Page 2 of Paper')
  })
})

describe('extractTags', () => {
  it('extracts hash tags from content', () => {
    const tags = extractTags('This is #idea and #draft content.')
    expect(tags).toContain('idea')
    expect(tags).toContain('draft')
  })

  it('does not extract tags from middle of word', () => {
    const tags = extractTags('email@example.com #valid foo#invalid')
    expect(tags).toContain('valid')
    expect(tags).not.toContain('invalid')
    expect(tags).not.toContain('example')
  })

  it('extracts tags at start of line', () => {
    const tags = extractTags('#first tag here')
    expect(tags).toContain('first')
  })

  it('deduplicates tags', () => {
    const tags = extractTags('#dup #dup #dup')
    expect(tags).toHaveLength(1)
    expect(tags[0]).toBe('dup')
  })

  it('supports nested/path tags', () => {
    const tags = extractTags('#project/alpha #status/done')
    expect(tags).toContain('project/alpha')
    expect(tags).toContain('status/done')
  })

  it('returns empty array for no tags', () => {
    expect(extractTags('no tags here')).toEqual([])
  })

  it('ignores pure numeric hashtags', () => {
    const tags = extractTags('#123 #abc')
    expect(tags).not.toContain('123')
    expect(tags).toContain('abc')
  })
})

describe('resolveWikiLinkPath', () => {
  const paths = [
    'notes/my-note.md',
    'notes/other-note.md',
    'Journal/2026-01-01.md',
    'deep/folder/readme.md',
  ]

  it('resolves exact filename match', () => {
    expect(resolveWikiLinkPath('my-note', paths)).toBe('notes/my-note.md')
  })

  it('resolves with spaces converted to hyphens', () => {
    expect(resolveWikiLinkPath('My Note', paths)).toBe('notes/my-note.md')
  })

  it('resolves partial path match', () => {
    expect(resolveWikiLinkPath('readme', paths)).toBe('deep/folder/readme.md')
  })

  it('returns null for no match', () => {
    expect(resolveWikiLinkPath('nonexistent', paths)).toBeNull()
  })

  it('is case insensitive', () => {
    expect(resolveWikiLinkPath('MY-NOTE', paths)).toBe('notes/my-note.md')
  })

  it('prefers exact over partial', () => {
    const withBoth = ['notes/readme.md', 'notes/readme-extra.md']
    expect(resolveWikiLinkPath('readme', withBoth)).toBe('notes/readme.md')
  })
})
