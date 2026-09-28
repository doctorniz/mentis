import MiniSearch from 'minisearch'
import type { Database } from '@sqlite.org/sqlite-wasm'
import type { SearchFilters, SearchResult } from '@/types/search'
import { parseSearchQuery } from '@/lib/search/parse-query'
import { buildSnippet } from '@/lib/search/snippet'
import type { IndexDocument, ManifestEntry, SearchHit } from './protocol'

/**
 * The vault index: SQLite tables holding derived data only. Everything here can
 * be rebuilt from the vault's files, so a missing, stale or corrupt database is
 * never an error — it is simply rebuilt.
 *
 * - `files` is the manifest: one row per indexed file, with the size and mtime
 *   it had when indexed. Reconciliation compares the vault against it.
 *   `hash` is reserved for sync change detection.
 * - `fts` is the FTS5 full-text table; its rowid is `files.id`.
 *
 * Search is FTS5 (prefix matching, bm25 ranking with title > tags > content),
 * plus typo-tolerant matching on titles through a small in-memory MiniSearch
 * over titles only. FTS5 has no fuzzy matching, and titles are what people
 * mistype most.
 *
 * Runs inside the index worker; the tests drive it directly with an in-memory
 * database.
 */

/**
 * Bump when the schema or what an extractor produces changes: an index built
 * by another version is dropped and rebuilt from the files.
 */
export const INDEX_VERSION = 1

// bm25 weights in fts column order: title, content, tags.
const BM25 = 'bm25(fts, 3.0, 1.0, 2.0)'

interface FileRow {
  path: string
  title: string
  type: string
  tags: string
  mtime: number
}

interface Hit {
  row: FileRow
  content: string
  score: number
  queryTerms: string[]
}

export class IndexStore {
  private titles: MiniSearch<{ id: string; title: string }>

  constructor(private readonly db: Database) {
    this.migrate()
    this.titles = createTitleIndex()
    const rows = this.db.selectObjects('SELECT path, title FROM files') as unknown as Array<{
      path: string
      title: string
    }>
    this.titles.addAll(rows.map((r) => ({ id: r.path, title: r.title })))
  }

  private migrate() {
    const version = Number(this.db.selectValue('PRAGMA user_version') ?? 0)
    if (version === INDEX_VERSION) return
    this.db.exec(`
      DROP TABLE IF EXISTS fts;
      DROP TABLE IF EXISTS files;
      CREATE TABLE files (
        id INTEGER PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        size INTEGER NOT NULL,
        mtime INTEGER NOT NULL,
        title TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '',
        hash TEXT,
        indexed_at INTEGER NOT NULL
      );
      CREATE VIRTUAL TABLE fts USING fts5(
        title, content, tags,
        tokenize = 'unicode61 remove_diacritics 2',
        prefix = '2 3'
      );
      PRAGMA user_version = ${INDEX_VERSION};
    `)
  }

  fileCount(): number {
    return Number(this.db.selectValue('SELECT count(*) FROM files') ?? 0)
  }

  manifest(): ManifestEntry[] {
    return this.db.selectObjects(
      'SELECT path, size, mtime FROM files',
    ) as unknown as ManifestEntry[]
  }

  upsert(docs: readonly IndexDocument[]): void {
    if (docs.length === 0) return
    const now = Date.now()
    this.db.transaction(() => {
      for (const doc of docs) {
        const tagCsv = doc.tags.join(',')
        const existing = this.db.selectValue('SELECT id FROM files WHERE path = ?', [doc.path])
        let id: number
        if (existing === undefined) {
          this.db.exec({
            sql: 'INSERT INTO files (path, type, size, mtime, title, tags, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            bind: [doc.path, doc.type, doc.size, doc.mtime, doc.title, tagCsv, now],
          })
          id = Number(this.db.selectValue('SELECT last_insert_rowid()'))
        } else {
          id = Number(existing)
          this.db.exec({
            sql: 'UPDATE files SET type = ?, size = ?, mtime = ?, title = ?, tags = ?, hash = NULL, indexed_at = ? WHERE id = ?',
            bind: [doc.type, doc.size, doc.mtime, doc.title, tagCsv, now, id],
          })
          this.db.exec({ sql: 'DELETE FROM fts WHERE rowid = ?', bind: [id] })
        }
        this.db.exec({
          sql: 'INSERT INTO fts (rowid, title, content, tags) VALUES (?, ?, ?, ?)',
          bind: [id, doc.title, doc.content, doc.tags.join(' ')],
        })
      }
    })
    for (const doc of docs) {
      if (this.titles.has(doc.path)) this.titles.discard(doc.path)
      this.titles.add({ id: doc.path, title: doc.title })
    }
  }

  remove(paths: readonly string[]): void {
    if (paths.length === 0) return
    this.db.transaction(() => {
      for (const path of paths) {
        const id = this.db.selectValue('SELECT id FROM files WHERE path = ?', [path])
        if (id === undefined) continue
        this.db.exec({ sql: 'DELETE FROM fts WHERE rowid = ?', bind: [id] })
        this.db.exec({ sql: 'DELETE FROM files WHERE id = ?', bind: [id] })
      }
    })
    for (const path of paths) {
      if (this.titles.has(path)) this.titles.discard(path)
    }
  }

  /** Search with `#tag` tokens and filters; results carry snippets, not content. */
  search(rawQuery: string, filters: SearchFilters = {}): SearchResult[] {
    const { text, hashTags } = parseSearchQuery(rawQuery)
    const tagSet = new Set([...(filters.tags ?? []).map((t) => t.toLowerCase()), ...hashTags])
    const merged: SearchFilters = { ...filters, tags: tagSet.size > 0 ? [...tagSet] : undefined }

    return this.query(text).flatMap((hit) => {
      if (!applyFilters(hit.row, merged)) return []
      const sn = buildSnippet(hit.content, hit.queryTerms)
      return [
        {
          id: hit.row.path,
          path: hit.row.path,
          title: hit.row.title,
          type: hit.row.type,
          score: hit.score,
          matches: [],
          snippetBefore: sn?.before ?? '',
          snippetHit: sn?.hit ?? '',
          snippetAfter: sn?.after ?? '',
        },
      ]
    })
  }

  /** Top hits with their full indexed content (vault chat's retrieval). */
  searchDocuments(query: string, topK: number): SearchHit[] {
    const q = query.trim()
    if (!q) return []
    return this.query(q)
      .slice(0, topK)
      .map((hit) => ({
        path: hit.row.path,
        title: hit.row.title,
        type: hit.row.type,
        score: hit.score,
        content: hit.content,
        queryTerms: hit.queryTerms,
      }))
  }

  /**
   * Full-text hits in rank order, then title-only fuzzy hits the full-text
   * pass missed. An empty query lists every document (used by `#tag`-only
   * searches, which then filter).
   */
  private query(text: string): Hit[] {
    const tokens = tokenize(text)
    if (tokens.length === 0) {
      // Punctuation only: nothing to match (as before), unlike an empty query.
      if (text.trim()) return []
      const rows = this.db.selectObjects(
        'SELECT f.path, f.title, f.type, f.tags, f.mtime, fts.content FROM files f JOIN fts ON fts.rowid = f.id ORDER BY f.path',
      ) as unknown as Array<FileRow & { content: string }>
      return rows.map((r) => ({ row: r, content: r.content, score: 1, queryTerms: [] as string[] }))
    }

    const match = tokens.map((t) => `"${t.replace(/"/g, '""')}"*`).join(' OR ')
    const rows = this.db.selectObjects(
      `SELECT f.path, f.title, f.type, f.tags, f.mtime, fts.content, ${BM25} AS rank
       FROM fts JOIN files f ON f.id = fts.rowid
       WHERE fts MATCH ? ORDER BY rank`,
      [match],
    ) as unknown as Array<FileRow & { content: string; rank: number }>

    const hits: Hit[] = rows.map((r) => ({
      row: r,
      content: r.content,
      score: -r.rank,
      queryTerms: expandTerms(`${r.title} ${r.content}`, tokens),
    }))

    const seen = new Set(rows.map((r) => r.path))
    const fuzzy = this.titles.search(text).filter((r) => !seen.has(String(r.id)))
    for (const r of fuzzy) {
      const row = this.db.selectObjects(
        'SELECT f.path, f.title, f.type, f.tags, f.mtime, fts.content FROM files f JOIN fts ON fts.rowid = f.id WHERE f.path = ?',
        [String(r.id)],
      )[0] as unknown as (FileRow & { content: string }) | undefined
      if (row) hits.push({ row, content: row.content, score: r.score, queryTerms: r.terms })
    }
    return hits
  }
}

function createTitleIndex() {
  return new MiniSearch<{ id: string; title: string }>({
    idField: 'id',
    fields: ['title'],
    searchOptions: { fuzzy: 0.2, prefix: true },
  })
}

/** Query words, split the way MiniSearch splits them. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\n\r\p{Z}\p{P}]+/u)
    .filter(Boolean)
}

/**
 * The words a prefix query actually matched ("proj" → "project"), so snippets
 * highlight whole words as they did before.
 */
function expandTerms(text: string, tokens: string[]): string[] {
  const lower = text.toLowerCase()
  return tokens.map((token) => {
    const at = lower.search(new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(token)}`, 'u'))
    if (at === -1) return token
    const start = lower.indexOf(token, at)
    const word = /^[\p{L}\p{N}_]+/u.exec(lower.slice(start))
    return word ? word[0] : token
  })
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function applyFilters(row: FileRow, filters: SearchFilters): boolean {
  if (filters.fileType !== undefined) {
    if (filters.fileType.length === 0) return false
    if (!filters.fileType.includes(row.type)) return false
  }
  if (filters.folder?.trim()) {
    const prefix = filters.folder.replace(/^\/+|\/+$/g, '')
    const p = row.path.replace(/^\/+/, '')
    if (!p.startsWith(prefix) && p !== prefix) return false
  }
  if (filters.tags?.length) {
    const docTags = new Set(
      row.tags
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    )
    for (const tag of filters.tags) {
      if (!docTags.has(tag.toLowerCase())) return false
    }
  }
  if (filters.dateRange?.from || filters.dateRange?.to) {
    const t = row.mtime
    if (filters.dateRange.from) {
      const from = new Date(filters.dateRange.from)
      from.setHours(0, 0, 0, 0)
      if (t < from.getTime()) return false
    }
    if (filters.dateRange.to) {
      const to = new Date(filters.dateRange.to)
      to.setHours(23, 59, 59, 999)
      if (t > to.getTime()) return false
    }
  }
  return true
}
