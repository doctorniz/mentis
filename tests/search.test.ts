import { describe, it, expect, beforeEach } from 'vitest'
import {
  clearSearchIndex,
  replaceSearchIndex,
  upsertSearchDocument,
  removeSearchDocument,
  searchVault,
  getSearchIndex,
} from '@/lib/search/index'
import { parseSearchQuery } from '@/lib/search/parse-query'
import { buildSnippet } from '@/lib/search/snippet'
import type { SearchIndexDocument } from '@/types/search'

function makeDoc(overrides: Partial<SearchIndexDocument> & { id: string }): SearchIndexDocument {
  return {
    path: overrides.id,
    title: 'Untitled',
    fileType: 'markdown',
    content: '',
    tags: '',
    tagCsv: '',
    modifiedAt: '2026-01-15T00:00:00.000Z',
    ...overrides,
  }
}

/* ---- parseSearchQuery ---- */

describe('parseSearchQuery', () => {
  it('extracts hash tags and returns plain text', () => {
    const { text, hashTags } = parseSearchQuery('meeting notes #work #urgent')
    expect(text).toBe('meeting notes')
    expect(hashTags).toEqual(['work', 'urgent'])
  })

  it('returns empty tags when none present', () => {
    const { text, hashTags } = parseSearchQuery('just text')
    expect(text).toBe('just text')
    expect(hashTags).toEqual([])
  })

  it('deduplicates tags', () => {
    const { hashTags } = parseSearchQuery('#dup #DUP #dup')
    expect(hashTags).toEqual(['dup'])
  })

  it('handles only tags, no text', () => {
    const { text, hashTags } = parseSearchQuery('#alpha #beta')
    expect(text).toBe('')
    expect(hashTags).toEqual(['alpha', 'beta'])
  })

  it('handles empty string', () => {
    const { text, hashTags } = parseSearchQuery('')
    expect(text).toBe('')
    expect(hashTags).toEqual([])
  })

  it('handles whitespace-only', () => {
    const { text, hashTags } = parseSearchQuery('   ')
    expect(text).toBe('')
    expect(hashTags).toEqual([])
  })

  it('preserves nested tag paths', () => {
    const { hashTags } = parseSearchQuery('#project/alpha')
    expect(hashTags).toEqual(['project/alpha'])
  })
})

/* ---- buildSnippet ---- */

describe('buildSnippet', () => {
  it('returns null for empty text', () => {
    expect(buildSnippet('', ['test'])).toBeNull()
  })

  it('highlights a matching term', () => {
    const result = buildSnippet('The quick brown fox jumps over the lazy dog', ['fox'])
    expect(result).not.toBeNull()
    expect(result!.hit).toBe('fox')
    expect(result!.before).toContain('brown')
  })

  it('returns full text with empty hit when no terms match', () => {
    const result = buildSnippet('Some text here', ['missing'])
    expect(result).not.toBeNull()
    expect(result!.hit).toBe('')
    expect(result!.before).toContain('Some text here')
  })

  it('handles terms with no search terms', () => {
    const result = buildSnippet('Hello world', [])
    expect(result).not.toBeNull()
    expect(result!.hit).toBe('')
  })

  it('truncates long text', () => {
    const long = 'word '.repeat(200)
    const result = buildSnippet(long, ['word'], 80)
    expect(result).not.toBeNull()
    const total = (result!.before + result!.hit + result!.after).length
    expect(total).toBeLessThanOrEqual(85)
  })

  it('skips single-character terms', () => {
    const result = buildSnippet('a b c d e hello world', ['a', 'hello'])
    expect(result).not.toBeNull()
    expect(result!.hit).toBe('hello')
  })

  it('finds earliest matching term', () => {
    const result = buildSnippet('alpha beta gamma delta', ['gamma', 'alpha'])
    expect(result).not.toBeNull()
    expect(result!.hit).toBe('alpha')
  })
})

/* ---- Search Index ---- */

describe('Search Index', () => {
  beforeEach(() => {
    clearSearchIndex()
  })

  it('starts empty', () => {
    const results = searchVault('anything')
    expect(results).toEqual([])
  })

  it('replaceSearchIndex populates the index', () => {
    replaceSearchIndex([
      makeDoc({ id: 'notes/hello.md', title: 'Hello World', content: 'Greeting everyone' }),
      makeDoc({ id: 'notes/bye.md', title: 'Goodbye', content: 'Farewell friends' }),
    ])
    const results = searchVault('hello')
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0]!.path).toBe('notes/hello.md')
  })

  it('upsertSearchDocument adds a new document', () => {
    const doc = makeDoc({ id: 'new.md', title: 'New Note', content: 'brand new' })
    upsertSearchDocument(doc)
    const results = searchVault('brand new')
    expect(results.length).toBeGreaterThanOrEqual(1)
  })

  it('upsertSearchDocument replaces an existing document', () => {
    upsertSearchDocument(makeDoc({ id: 'note.md', title: 'Original', content: 'unicornalpha' }))
    upsertSearchDocument(makeDoc({ id: 'note.md', title: 'Updated', content: 'zebrabeta' }))
    const r1 = searchVault('unicornalpha')
    const r2 = searchVault('zebrabeta')
    expect(r2.length).toBeGreaterThanOrEqual(1)
    expect(r2[0]!.title).toBe('Updated')
    expect(r1.every((r) => r.path !== 'note.md')).toBe(true)
  })

  it('removeSearchDocument removes from index', () => {
    replaceSearchIndex([makeDoc({ id: 'a.md', title: 'A', content: 'alpha' })])
    removeSearchDocument('a.md')
    const results = searchVault('alpha')
    expect(results).toEqual([])
  })

  it('removeSearchDocument is safe for nonexistent id', () => {
    expect(() => removeSearchDocument('ghost.md')).not.toThrow()
  })

  it('filters by fileType', () => {
    replaceSearchIndex([
      makeDoc({ id: 'a.md', fileType: 'markdown', title: 'Note A', content: 'content' }),
      makeDoc({ id: 'b.pdf', fileType: 'pdf', title: 'PDF B', content: 'content' }),
    ])
    const mdOnly = searchVault('content', { fileType: ['markdown'] })
    expect(mdOnly.every((r) => r.type === 'markdown')).toBe(true)
  })

  it('filters by folder prefix', () => {
    replaceSearchIndex([
      makeDoc({ id: 'journal/entry.md', path: 'journal/entry.md', title: 'Entry', content: 'data' }),
      makeDoc({ id: 'notes/other.md', path: 'notes/other.md', title: 'Other', content: 'data' }),
    ])
    const results = searchVault('data', { folder: 'journal' })
    expect(results).toHaveLength(1)
    expect(results[0]!.path).toBe('journal/entry.md')
  })

  it('filters by tags', () => {
    replaceSearchIndex([
      makeDoc({ id: 'a.md', title: 'A', content: 'stuff', tags: 'work meeting', tagCsv: 'work,meeting' }),
      makeDoc({ id: 'b.md', title: 'B', content: 'stuff', tags: 'personal', tagCsv: 'personal' }),
    ])
    const results = searchVault('stuff', { tags: ['work'] })
    expect(results).toHaveLength(1)
    expect(results[0]!.path).toBe('a.md')
  })

  it('supports hash tag queries', () => {
    replaceSearchIndex([
      makeDoc({ id: 'a.md', title: 'A', content: 'text', tags: 'idea', tagCsv: 'idea' }),
      makeDoc({ id: 'b.md', title: 'B', content: 'text', tags: 'draft', tagCsv: 'draft' }),
    ])
    const results = searchVault('text #idea')
    expect(results).toHaveLength(1)
    expect(results[0]!.path).toBe('a.md')
  })

  it('filters by date range', () => {
    replaceSearchIndex([
      makeDoc({ id: 'old.md', title: 'Old', content: 'item', modifiedAt: '2025-01-01T00:00:00.000Z' }),
      makeDoc({ id: 'new.md', title: 'New', content: 'item', modifiedAt: '2026-06-15T00:00:00.000Z' }),
    ])
    const results = searchVault('item', { dateRange: { from: '2026-01-01' } })
    expect(results).toHaveLength(1)
    expect(results[0]!.path).toBe('new.md')
  })

  it('clearSearchIndex resets everything', () => {
    replaceSearchIndex([makeDoc({ id: 'x.md', title: 'X', content: 'xdata' })])
    clearSearchIndex()
    const results = searchVault('xdata')
    expect(results).toEqual([])
  })

  it('returns empty for fileType filter with empty array', () => {
    replaceSearchIndex([makeDoc({ id: 'a.md', title: 'A', content: 'hello' })])
    const results = searchVault('hello', { fileType: [] })
    expect(results).toEqual([])
  })

  it('title matches rank higher than content matches', () => {
    replaceSearchIndex([
      makeDoc({ id: 'a.md', title: 'Banana', content: 'apple is a fruit' }),
      makeDoc({ id: 'b.md', title: 'Apple Pie', content: 'baked goods' }),
    ])
    const results = searchVault('apple')
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0]!.title).toBe('Apple Pie')
  })
})
