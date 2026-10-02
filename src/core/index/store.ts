import MiniSearch from 'minisearch'
import type { Database } from '@sqlite.org/sqlite-wasm'
import type { SearchResult } from '@/types/search'
import { parseSearchQuery } from '@/lib/search/parse-query'
import { buildSnippet } from '@/lib/search/snippet'
import { SEARCH_CONTENT_CAP } from '@/lib/search/content-cap'
import { chunkText } from './chunk'
import type {
  FileHash,
  IndexDocument,
  IndexSearchFilters,
  LinkRow,
  ManifestEntry,
  PassageHit,
  TreeListing,
  TreeRow,
} from './protocol'

/**
 * The vault index: SQLite tables holding derived data only. Everything here can
 * be rebuilt from the vault's files, so a missing, stale or corrupt database is
 * never an error — it is simply rebuilt.
 *
 * - `files` is the manifest: one row per indexed file, with the size and mtime
 *   it had when indexed. Reconciliation compares the vault against it.
 * - `fts` is the FTS5 table global search uses; its rowid is `files.id`. It
 *   holds the first SEARCH_CONTENT_CAP characters of each file.
 * - `chunks` is an FTS5 table of overlapping passages covering each file's
 *   whole text, for chat retrieval. A passage's rowid is
 *   `files.id * CHUNK_STRIDE + seq`, so a file's passages are one rowid range.
 * - `hashes` caches each file's SHA-256 with the size and mtime it had when
 *   hashed, for sync change detection. It covers every file sync looks at
 *   (media and system files too), not just searchable ones. A file whose size
 *   and mtime are unchanged is taken to be unchanged, as git and rsync do.
 * - `links` holds each file's wiki-links exactly as written. They are not
 *   resolved here: what a link points at depends on which files exist, so
 *   callers resolve them against the current manifest.
 *
 * - `tree` and `listed` record the file tree: every folder and every file
 *   of a registered type, by parent folder, and which folders have been
 *   listed (so a folder known to be empty differs from one never seen). The
 *   tree paints from here before the disk answers.
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
export const INDEX_VERSION = 5

// bm25 weights in fts column order: title, content, tags.
const BM25 = 'bm25(fts, 3.0, 1.0, 2.0)'
// bm25 weights in chunks column order: title, text.
const CHUNK_BM25 = 'bm25(chunks, 2.0, 1.0)'

/** Passages per file the rowid scheme allows (FULL_TEXT_CAP needs about 1,500). */
const CHUNK_STRIDE = 1 << 16

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
      DROP TABLE IF EXISTS chunks;
      DROP TABLE IF EXISTS files;
      DROP TABLE IF EXISTS hashes;
      DROP TABLE IF EXISTS links;
      DROP TABLE IF EXISTS tree;
      DROP TABLE IF EXISTS listed;
      CREATE TABLE files (
        id INTEGER PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        size INTEGER NOT NULL,
        mtime INTEGER NOT NULL,
        title TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '',
        indexed_at INTEGER NOT NULL
      );
      CREATE VIRTUAL TABLE fts USING fts5(
        title, content, tags,
        tokenize = 'unicode61 remove_diacritics 2',
        prefix = '2 3'
      );
      CREATE VIRTUAL TABLE chunks USING fts5(
        title, text,
        tokenize = 'unicode61 remove_diacritics 2',
        prefix = '2 3'
      );
      CREATE TABLE hashes (
        path TEXT PRIMARY KEY,
        size INTEGER NOT NULL,
        mtime INTEGER NOT NULL,
        hash TEXT NOT NULL
      ) WITHOUT ROWID;
      CREATE TABLE links (
        source TEXT NOT NULL,
        target TEXT NOT NULL,
        PRIMARY KEY (source, target)
      ) WITHOUT ROWID;
      CREATE TABLE tree (
        path TEXT PRIMARY KEY,
        parent TEXT NOT NULL,
        name TEXT NOT NULL,
        is_dir INTEGER NOT NULL,
        size INTEGER NOT NULL,
        mtime INTEGER NOT NULL
      ) WITHOUT ROWID;
      CREATE INDEX tree_parent ON tree (parent);
      CREATE TABLE listed (dir TEXT PRIMARY KEY) WITHOUT ROWID;
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

  /** The entries last recorded for `dir`, or null if it was never listed. */
  children(dir: string): TreeRow[] | null {
    if (this.db.selectValue('SELECT 1 FROM listed WHERE dir = ?', [dir]) === undefined) return null
    const rows = this.db.selectObjects(
      'SELECT name, path, is_dir, size, mtime FROM tree WHERE parent = ?',
      [dir],
    ) as unknown as Array<{
      name: string
      path: string
      is_dir: number
      size: number
      mtime: number
    }>
    return rows.map((r) => ({
      name: r.name,
      path: r.path,
      isDirectory: r.is_dir === 1,
      size: r.size,
      mtime: r.mtime,
    }))
  }

  setChildren(listings: readonly TreeListing[]): void {
    if (listings.length === 0) return
    this.db.transaction(() => {
      const insert = this.db.prepare(
        'INSERT OR REPLACE INTO tree (path, parent, name, is_dir, size, mtime) VALUES (?, ?, ?, ?, ?, ?)',
      )
      try {
        for (const { dir, entries } of listings) {
          const now = new Set(entries.map((e) => e.path))
          const before = this.db.selectObjects(
            'SELECT path FROM tree WHERE parent = ? AND is_dir = 1',
            [dir],
          ) as unknown as Array<{ path: string }>
          for (const { path } of before) if (!now.has(path)) this.forgetFolder(path)
          this.db.exec({ sql: 'DELETE FROM tree WHERE parent = ?', bind: [dir] })
          for (const e of entries) {
            insert.bind([e.path, dir, e.name, e.isDirectory ? 1 : 0, e.size, e.mtime]).stepReset()
          }
          this.db.exec({ sql: 'INSERT OR IGNORE INTO listed (dir) VALUES (?)', bind: [dir] })
        }
      } finally {
        insert.finalize()
      }
    })
  }

  /** Drops a folder's own row, everything recorded beneath it, and its listed marks. */
  private forgetFolder(path: string) {
    const prefix = `${path}/`
    const len = [...prefix].length // SQLite's substr counts characters, not UTF-16 units
    this.db.exec({
      sql: 'DELETE FROM tree WHERE path = ? OR substr(path, 1, ?) = ?',
      bind: [path, len, prefix],
    })
    this.db.exec({
      sql: 'DELETE FROM listed WHERE dir = ? OR substr(dir, 1, ?) = ?',
      bind: [path, len, prefix],
    })
  }

  links(): LinkRow[] {
    return this.db.selectObjects('SELECT source, target FROM links') as unknown as LinkRow[]
  }

  /**
   * Given every file sync can see now, forget cached hashes for files that are
   * gone and return the ones still valid (same size and mtime), by path.
   */
  validHashes(files: readonly ManifestEntry[]): Record<string, string> {
    const out: Record<string, string> = {}
    this.db.transaction(() => {
      this.db.exec(
        'CREATE TEMP TABLE IF NOT EXISTS seen (path TEXT PRIMARY KEY, size INTEGER, mtime INTEGER); DELETE FROM seen;',
      )
      const insert = this.db.prepare(
        'INSERT OR REPLACE INTO seen (path, size, mtime) VALUES (?, ?, ?)',
      )
      try {
        for (const f of files) insert.bind([f.path, f.size, f.mtime]).stepReset()
      } finally {
        insert.finalize()
      }
      this.db.exec('DELETE FROM hashes WHERE path NOT IN (SELECT path FROM seen)')
      const rows = this.db.selectObjects(
        'SELECT h.path, h.hash FROM hashes h JOIN seen s ON s.path = h.path AND s.size = h.size AND s.mtime = h.mtime',
      ) as unknown as Array<{ path: string; hash: string }>
      for (const r of rows) out[r.path] = r.hash
      this.db.exec('DELETE FROM seen')
    })
    return out
  }

  /** Remember hashes computed for files at the given size and mtime. */
  putHashes(entries: readonly FileHash[]): void {
    if (entries.length === 0) return
    this.db.transaction(() => {
      const insert = this.db.prepare(
        'INSERT OR REPLACE INTO hashes (path, size, mtime, hash) VALUES (?, ?, ?, ?)',
      )
      try {
        for (const e of entries) insert.bind([e.path, e.size, e.mtime, e.hash]).stepReset()
      } finally {
        insert.finalize()
      }
    })
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
            sql: 'UPDATE files SET type = ?, size = ?, mtime = ?, title = ?, tags = ?, indexed_at = ? WHERE id = ?',
            bind: [doc.type, doc.size, doc.mtime, doc.title, tagCsv, now, id],
          })
          this.db.exec({ sql: 'DELETE FROM fts WHERE rowid = ?', bind: [id] })
          this.deleteChunks(id)
        }
        this.db.exec({
          sql: 'INSERT INTO fts (rowid, title, content, tags) VALUES (?, ?, ?, ?)',
          bind: [id, doc.title, doc.content.slice(0, SEARCH_CONTENT_CAP), doc.tags.join(' ')],
        })
        const passages = chunkText(doc.content).slice(0, CHUNK_STRIDE)
        passages.forEach((text, seq) => {
          this.db.exec({
            sql: 'INSERT INTO chunks (rowid, title, text) VALUES (?, ?, ?)',
            bind: [id * CHUNK_STRIDE + seq, doc.title, text],
          })
        })
        this.db.exec({ sql: 'DELETE FROM links WHERE source = ?', bind: [doc.path] })
        for (const target of new Set(doc.links ?? [])) {
          this.db.exec({
            sql: 'INSERT INTO links (source, target) VALUES (?, ?)',
            bind: [doc.path, target],
          })
        }
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
        this.deleteChunks(Number(id))
        this.db.exec({ sql: 'DELETE FROM files WHERE id = ?', bind: [id] })
        this.db.exec({ sql: 'DELETE FROM links WHERE source = ?', bind: [path] })
      }
    })
    for (const path of paths) {
      if (this.titles.has(path)) this.titles.discard(path)
    }
  }

  /** Search with `#tag` tokens and filters; results carry snippets, not content. */
  search(rawQuery: string, filters: IndexSearchFilters = {}): SearchResult[] {
    const { text, hashTags } = parseSearchQuery(rawQuery)
    const tagSet = new Set([...(filters.tags ?? []).map((t) => t.toLowerCase()), ...hashTags])
    const merged: IndexSearchFilters = {
      ...filters,
      tags: tagSet.size > 0 ? [...tagSet] : undefined,
    }

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

  /**
   * The passages that best match `query`, best first, from anywhere in a
   * file's text (vault chat's retrieval).
   */
  searchPassages(query: string, limit: number): PassageHit[] {
    const tokens = tokenize(query)
    if (tokens.length === 0) return []
    const match = tokens.map((t) => `"${t.replace(/"/g, '""')}"*`).join(' OR ')
    const rows = this.db.selectObjects(
      `SELECT c.rowid AS rid, c.text, ${CHUNK_BM25} AS rank, f.path, f.title, f.type
       FROM chunks c JOIN files f ON f.id = c.rowid / ${CHUNK_STRIDE}
       WHERE chunks MATCH ? ORDER BY rank LIMIT ?`,
      [match, limit],
    ) as unknown as Array<{
      rid: number
      text: string
      rank: number
      path: string
      title: string
      type: string
    }>
    return rows.map((r) => ({
      path: r.path,
      title: r.title,
      type: r.type,
      seq: Number(r.rid) % CHUNK_STRIDE,
      text: r.text,
      score: -r.rank,
      queryTerms: expandTerms(`${r.title} ${r.text}`, tokens),
    }))
  }

  private deleteChunks(fileId: number) {
    this.db.exec({
      sql: 'DELETE FROM chunks WHERE rowid >= ? AND rowid < ?',
      bind: [fileId * CHUNK_STRIDE, (fileId + 1) * CHUNK_STRIDE],
    })
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

function applyFilters(row: FileRow, filters: IndexSearchFilters): boolean {
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
  if (filters.modifiedFrom !== undefined && row.mtime < filters.modifiedFrom) return false
  if (filters.modifiedTo !== undefined && row.mtime > filters.modifiedTo) return false
  return true
}
