import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import sqlite3InitModule, { type Database } from '@sqlite.org/sqlite-wasm'
import { IndexStore, INDEX_VERSION } from '@/core/index/store'
import { planReconcile } from '@/core/index/reconcile'
import type { IndexDocument } from '@/core/index/protocol'
import { parseSearchQuery } from '@/lib/search/parse-query'
import { buildSnippet } from '@/lib/search/snippet'
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

/* ---- Search Index (SQLite + FTS5 store, as run inside the index worker) ---- */

let sqlite3: Awaited<ReturnType<typeof sqlite3InitModule>>
let db: Database
let store: IndexStore

beforeAll(async () => {
  sqlite3 = await sqlite3InitModule()
})

function makeDoc(overrides: Partial<IndexDocument> & { path: string }): IndexDocument {
  return {
    type: 'markdown',
    title: 'Untitled',
    content: '',
    tags: [],
    size: 10,
    mtime: Date.parse('2026-01-15T00:00:00.000Z'),
    ...overrides,
  }
}

describe('Search Index', () => {
  beforeEach(() => {
    db = new sqlite3.oo1.DB(':memory:')
    store = new IndexStore(db)
  })

  it('starts empty', () => {
    expect(store.search('anything')).toEqual([])
    expect(store.fileCount()).toBe(0)
  })

  it('upsert populates the index', () => {
    store.upsert([
      makeDoc({ path: 'notes/hello.md', title: 'Hello World', content: 'Greeting everyone' }),
      makeDoc({ path: 'notes/bye.md', title: 'Goodbye', content: 'Farewell friends' }),
    ])
    const results = store.search('hello')
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0]!.path).toBe('notes/hello.md')
  })

  it('upsert replaces an existing document', () => {
    store.upsert([makeDoc({ path: 'note.md', title: 'Original', content: 'unicornalpha' })])
    store.upsert([makeDoc({ path: 'note.md', title: 'Updated', content: 'zebrabeta' })])
    const r1 = store.search('unicornalpha')
    const r2 = store.search('zebrabeta')
    expect(r2.length).toBeGreaterThanOrEqual(1)
    expect(r2[0]!.title).toBe('Updated')
    expect(r1.every((r) => r.path !== 'note.md')).toBe(true)
    expect(store.fileCount()).toBe(1)
  })

  it('remove removes from index', () => {
    store.upsert([makeDoc({ path: 'a.md', title: 'A', content: 'alpha' })])
    store.remove(['a.md'])
    expect(store.search('alpha')).toEqual([])
    expect(store.manifest()).toEqual([])
  })

  it('remove is safe for nonexistent paths', () => {
    expect(() => store.remove(['ghost.md'])).not.toThrow()
  })

  it('filters by fileType', () => {
    store.upsert([
      makeDoc({ path: 'a.md', type: 'markdown', title: 'Note A', content: 'content' }),
      makeDoc({ path: 'b.pdf', type: 'pdf', title: 'PDF B', content: 'content' }),
    ])
    const mdOnly = store.search('content', { fileType: ['markdown'] })
    expect(mdOnly.length).toBe(1)
    expect(mdOnly.every((r) => r.type === 'markdown')).toBe(true)
  })

  it('filters by folder prefix', () => {
    store.upsert([
      makeDoc({ path: 'journal/entry.md', title: 'Entry', content: 'data' }),
      makeDoc({ path: 'notes/other.md', title: 'Other', content: 'data' }),
    ])
    const results = store.search('data', { folder: 'journal' })
    expect(results).toHaveLength(1)
    expect(results[0]!.path).toBe('journal/entry.md')
  })

  it('filters by tags', () => {
    store.upsert([
      makeDoc({ path: 'a.md', title: 'A', content: 'stuff', tags: ['work', 'meeting'] }),
      makeDoc({ path: 'b.md', title: 'B', content: 'stuff', tags: ['personal'] }),
    ])
    const results = store.search('stuff', { tags: ['work'] })
    expect(results).toHaveLength(1)
    expect(results[0]!.path).toBe('a.md')
  })

  it('supports hash tag queries', () => {
    store.upsert([
      makeDoc({ path: 'a.md', title: 'A', content: 'text', tags: ['idea'] }),
      makeDoc({ path: 'b.md', title: 'B', content: 'text', tags: ['draft'] }),
    ])
    const results = store.search('text #idea')
    expect(results).toHaveLength(1)
    expect(results[0]!.path).toBe('a.md')
  })

  it('lists every tagged document for a tag-only query', () => {
    store.upsert([
      makeDoc({ path: 'a.md', title: 'A', content: 'one', tags: ['idea'] }),
      makeDoc({ path: 'b.md', title: 'B', content: 'two', tags: ['idea'] }),
      makeDoc({ path: 'c.md', title: 'C', content: 'three' }),
    ])
    expect(store.search('#idea').map((r) => r.path)).toEqual(['a.md', 'b.md'])
  })

  it('filters by date range', () => {
    store.upsert([
      makeDoc({
        path: 'old.md',
        title: 'Old',
        content: 'item',
        mtime: Date.parse('2025-01-01T00:00:00Z'),
      }),
      makeDoc({
        path: 'new.md',
        title: 'New',
        content: 'item',
        mtime: Date.parse('2026-06-15T00:00:00Z'),
      }),
    ])
    const results = store.search('item', { dateRange: { from: '2026-01-01' } })
    expect(results).toHaveLength(1)
    expect(results[0]!.path).toBe('new.md')
  })

  it('returns empty for fileType filter with empty array', () => {
    store.upsert([makeDoc({ path: 'a.md', title: 'A', content: 'hello' })])
    expect(store.search('hello', { fileType: [] })).toEqual([])
  })

  it('returns nothing for a punctuation-only query', () => {
    store.upsert([makeDoc({ path: 'a.md', title: 'A', content: 'hello' })])
    expect(store.search('!!!')).toEqual([])
  })

  it('title matches rank higher than content matches', () => {
    store.upsert([
      makeDoc({ path: 'a.md', title: 'Banana', content: 'apple is a fruit' }),
      makeDoc({ path: 'b.md', title: 'Apple Pie', content: 'baked goods' }),
    ])
    const results = store.search('apple')
    expect(results.length).toBe(2)
    expect(results[0]!.title).toBe('Apple Pie')
  })

  it('matches word prefixes and highlights the whole word', () => {
    store.upsert([makeDoc({ path: 'a.md', title: 'A', content: 'Our quarterly planning session' })])
    const [hit] = store.search('plan')
    expect(hit?.path).toBe('a.md')
    expect(hit?.snippetHit).toBe('planning')
  })

  it('tolerates typos in titles', () => {
    store.upsert([
      makeDoc({ path: 'plan.md', title: 'Project Plan', content: 'This is our main overview.' }),
    ])
    expect(store.search('projct').map((r) => r.path)).toEqual(['plan.md'])
  })

  it('searchDocuments returns top hits with their content', () => {
    store.upsert([
      makeDoc({ path: 'a.md', title: 'Alpha', content: 'the quick brown fox' }),
      makeDoc({ path: 'b.md', title: 'Beta', content: 'the lazy dog' }),
    ])
    const hits = store.searchDocuments('fox', 5)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ path: 'a.md', content: 'the quick brown fox' })
    expect(hits[0]!.queryTerms).toEqual(['fox'])
  })

  it('keeps its data across reopening (the saved index)', () => {
    store.upsert([makeDoc({ path: 'a.md', title: 'Kept Title', content: 'persistent words' })])
    const reopened = new IndexStore(db)
    expect(reopened.manifest()).toEqual([
      { path: 'a.md', size: 10, mtime: Date.parse('2026-01-15T00:00:00.000Z') },
    ])
    expect(reopened.search('persistent')[0]?.path).toBe('a.md')
    expect(reopened.search('kpt titel').map((r) => r.path)).toEqual(['a.md'])
  })

  it('rebuilds from scratch when the index version changes', () => {
    store.upsert([makeDoc({ path: 'a.md', title: 'A', content: 'alpha' })])
    db.exec(`PRAGMA user_version = ${INDEX_VERSION + 1}`)
    const rebuilt = new IndexStore(db)
    expect(rebuilt.fileCount()).toBe(0)
    expect(rebuilt.search('alpha')).toEqual([])
  })
})

/* ---- Reconcile plan ---- */

describe('planReconcile', () => {
  const entry = (path: string, size = 1, mtime = 1) => ({ path, size, mtime })

  it('indexes everything when the manifest is empty', () => {
    expect(planReconcile([], [entry('a.md'), entry('b.md')])).toEqual({
      toIndex: ['a.md', 'b.md'],
      toRemove: [],
    })
  })

  it('does nothing when nothing changed', () => {
    const files = [entry('a.md'), entry('b.md')]
    expect(planReconcile(files, files)).toEqual({ toIndex: [], toRemove: [] })
  })

  it('re-indexes files whose size or mtime changed, and removes deleted ones', () => {
    const manifest = [
      entry('same.md'),
      entry('grew.md', 1),
      entry('touched.md', 1, 1),
      entry('gone.md'),
    ]
    const vault = [
      entry('same.md'),
      entry('grew.md', 2),
      entry('touched.md', 1, 2),
      entry('new.md'),
    ]
    expect(planReconcile(manifest, vault)).toEqual({
      toIndex: ['grew.md', 'touched.md', 'new.md'],
      toRemove: ['gone.md'],
    })
  })
})
