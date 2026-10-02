//! The vault index in native SQLite: the same schema, queries and search rules
//! as `src/core/index/store.ts`. Derived data only — the files are the source
//! of truth, and a missing, stale or corrupt database is rebuilt, never fatal.

use std::collections::{BTreeMap, HashSet};

use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};

use super::text::{
    build_snippet, chunk_text, expand_terms, js_trim, parse_search_query, tokenize, truncate_units,
};
use super::titles::TitleIndex;

/// Bump when the schema or what an extractor produces changes; an index built
/// by another version is dropped and rebuilt. Kept equal to the TypeScript store's.
pub const INDEX_VERSION: i64 = 5;

/// Content kept in the full-text table (`SEARCH_CONTENT_CAP` in `content-cap.ts`).
const SEARCH_CONTENT_CAP: usize = 14_000;
/// Passages per file the rowid scheme allows.
const CHUNK_STRIDE: i64 = 1 << 16;
const SNIPPET_LEN: usize = 140;

const BM25: &str = "bm25(fts, 3.0, 1.0, 2.0)";
const CHUNK_BM25: &str = "bm25(chunks, 2.0, 1.0)";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexDocument {
    pub path: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub title: String,
    pub content: String,
    pub tags: Vec<String>,
    #[serde(default)]
    pub links: Vec<String>,
    pub size: f64,
    pub mtime: f64,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TreeRow {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub size: f64,
    pub mtime: f64,
}

#[derive(Deserialize)]
pub struct TreeListing {
    pub dir: String,
    pub entries: Vec<TreeRow>,
}

#[derive(Deserialize)]
pub struct ManifestEntry {
    pub path: String,
    pub size: f64,
    pub mtime: f64,
}

#[derive(Deserialize)]
pub struct FileHash {
    pub path: String,
    pub size: f64,
    pub mtime: f64,
    pub hash: String,
}

#[derive(Serialize)]
pub struct LinkRow {
    pub source: String,
    pub target: String,
}

/// Search filters. Date bounds arrive as epoch milliseconds: the caller turns
/// local calendar days into instants, so both stores agree whatever the time zone.
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SearchFilters {
    pub file_type: Option<Vec<String>>,
    pub folder: Option<String>,
    pub tags: Option<Vec<String>>,
    pub modified_from: Option<f64>,
    pub modified_to: Option<f64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub id: String,
    pub path: String,
    pub title: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub score: f64,
    pub matches: Vec<()>,
    pub snippet_before: String,
    pub snippet_hit: String,
    pub snippet_after: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PassageHit {
    pub path: String,
    pub title: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub seq: i64,
    pub text: String,
    pub score: f64,
    pub query_terms: Vec<String>,
}

struct FileRow {
    path: String,
    title: String,
    kind: String,
    tags: String,
    mtime: f64,
}

struct Hit {
    row: FileRow,
    content: String,
    score: f64,
    terms: Vec<String>,
}

pub struct IndexStore {
    db: Connection,
    titles: TitleIndex,
}

impl IndexStore {
    pub fn new(db: Connection) -> rusqlite::Result<Self> {
        db.execute_batch("PRAGMA temp_store = MEMORY; PRAGMA synchronous = NORMAL;")?;
        migrate(&db)?;
        let mut titles = TitleIndex::default();
        {
            let mut stmt = db.prepare("SELECT path, title FROM files")?;
            let rows =
                stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
            for row in rows {
                let (path, title) = row?;
                titles.insert(&path, &title);
            }
        }
        Ok(Self { db, titles })
    }

    pub fn file_count(&self) -> rusqlite::Result<i64> {
        self.db
            .query_row("SELECT count(*) FROM files", [], |r| r.get(0))
    }

    pub fn manifest(&self) -> rusqlite::Result<Vec<serde_json::Value>> {
        let mut stmt = self.db.prepare("SELECT path, size, mtime FROM files")?;
        let rows = stmt.query_map([], |r| {
            Ok(serde_json::json!({
                "path": r.get::<_, String>(0)?,
                "size": num(r.get(1)?),
                "mtime": num(r.get(2)?),
            }))
        })?;
        rows.collect()
    }

    /// The entries last recorded for `dir`, or `None` if it was never listed.
    pub fn children(&self, dir: &str) -> rusqlite::Result<Option<Vec<serde_json::Value>>> {
        let known = self
            .db
            .query_row("SELECT 1 FROM listed WHERE dir = ?", [dir], |_| Ok(()))
            .optional()?;
        if known.is_none() {
            return Ok(None);
        }
        let mut stmt = self
            .db
            .prepare("SELECT name, path, is_dir, size, mtime FROM tree WHERE parent = ?")?;
        let rows = stmt.query_map([dir], |r| {
            Ok(serde_json::json!({
                "name": r.get::<_, String>(0)?,
                "path": r.get::<_, String>(1)?,
                "isDirectory": r.get::<_, i64>(2)? == 1,
                "size": num(r.get(3)?),
                "mtime": num(r.get(4)?),
            }))
        })?;
        Ok(Some(rows.collect::<Result<_, _>>()?))
    }

    pub fn set_children(&mut self, listings: &[TreeListing]) -> rusqlite::Result<()> {
        if listings.is_empty() {
            return Ok(());
        }
        let tx = self.db.transaction()?;
        {
            let mut insert = tx.prepare(
                "INSERT OR REPLACE INTO tree (path, parent, name, is_dir, size, mtime) VALUES (?, ?, ?, ?, ?, ?)",
            )?;
            for TreeListing { dir, entries } in listings {
                let now: HashSet<&str> = entries.iter().map(|e| e.path.as_str()).collect();
                let before: Vec<String> = tx
                    .prepare("SELECT path FROM tree WHERE parent = ? AND is_dir = 1")?
                    .query_map([dir], |r| r.get(0))?
                    .collect::<Result<_, _>>()?;
                for path in before.iter().filter(|p| !now.contains(p.as_str())) {
                    forget_folder(&tx, path)?;
                }
                tx.execute("DELETE FROM tree WHERE parent = ?", [dir])?;
                for e in entries {
                    insert.execute(params![
                        e.path,
                        dir,
                        e.name,
                        e.is_directory as i64,
                        e.size,
                        e.mtime
                    ])?;
                }
                tx.execute("INSERT OR IGNORE INTO listed (dir) VALUES (?)", [dir])?;
            }
        }
        tx.commit()
    }

    pub fn links(&self) -> rusqlite::Result<Vec<LinkRow>> {
        let mut stmt = self.db.prepare("SELECT source, target FROM links")?;
        let rows = stmt.query_map([], |r| {
            Ok(LinkRow {
                source: r.get(0)?,
                target: r.get(1)?,
            })
        })?;
        rows.collect()
    }

    /// Given every file sync can see now, forget cached hashes for files that are
    /// gone and return the ones still valid (same size and mtime), by path.
    pub fn valid_hashes(
        &mut self,
        files: &[ManifestEntry],
    ) -> rusqlite::Result<BTreeMap<String, String>> {
        let tx = self.db.transaction()?;
        tx.execute_batch(
            "CREATE TEMP TABLE IF NOT EXISTS seen (path TEXT PRIMARY KEY, size INTEGER, mtime INTEGER); DELETE FROM seen;",
        )?;
        {
            let mut insert =
                tx.prepare("INSERT OR REPLACE INTO seen (path, size, mtime) VALUES (?, ?, ?)")?;
            for f in files {
                insert.execute(params![f.path, f.size, f.mtime])?;
            }
        }
        tx.execute(
            "DELETE FROM hashes WHERE path NOT IN (SELECT path FROM seen)",
            [],
        )?;
        let out = tx
            .prepare(
                "SELECT h.path, h.hash FROM hashes h JOIN seen s ON s.path = h.path AND s.size = h.size AND s.mtime = h.mtime",
            )?
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
            .collect::<Result<BTreeMap<_, _>, _>>()?;
        tx.execute("DELETE FROM seen", [])?;
        tx.commit()?;
        Ok(out)
    }

    pub fn put_hashes(&mut self, entries: &[FileHash]) -> rusqlite::Result<()> {
        if entries.is_empty() {
            return Ok(());
        }
        let tx = self.db.transaction()?;
        {
            let mut insert = tx.prepare(
                "INSERT OR REPLACE INTO hashes (path, size, mtime, hash) VALUES (?, ?, ?, ?)",
            )?;
            for e in entries {
                insert.execute(params![e.path, e.size, e.mtime, e.hash])?;
            }
        }
        tx.commit()
    }

    pub fn upsert(&mut self, docs: &[IndexDocument]) -> rusqlite::Result<()> {
        if docs.is_empty() {
            return Ok(());
        }
        let now = now_ms();
        let tx = self.db.transaction()?;
        for doc in docs {
            let tag_csv = doc.tags.join(",");
            let existing: Option<i64> = tx
                .query_row("SELECT id FROM files WHERE path = ?", [&doc.path], |r| {
                    r.get(0)
                })
                .optional()?;
            let id = match existing {
                None => {
                    tx.execute(
                        "INSERT INTO files (path, type, size, mtime, title, tags, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        params![doc.path, doc.kind, doc.size, doc.mtime, doc.title, tag_csv, now],
                    )?;
                    tx.last_insert_rowid()
                }
                Some(id) => {
                    tx.execute(
                        "UPDATE files SET type = ?, size = ?, mtime = ?, title = ?, tags = ?, indexed_at = ? WHERE id = ?",
                        params![doc.kind, doc.size, doc.mtime, doc.title, tag_csv, now, id],
                    )?;
                    tx.execute("DELETE FROM fts WHERE rowid = ?", [id])?;
                    delete_chunks(&tx, id)?;
                    id
                }
            };
            tx.execute(
                "INSERT INTO fts (rowid, title, content, tags) VALUES (?, ?, ?, ?)",
                params![
                    id,
                    doc.title,
                    truncate_units(&doc.content, SEARCH_CONTENT_CAP),
                    doc.tags.join(" ")
                ],
            )?;
            {
                let mut insert =
                    tx.prepare("INSERT INTO chunks (rowid, title, text) VALUES (?, ?, ?)")?;
                for (seq, text) in chunk_text(&doc.content)
                    .into_iter()
                    .take(CHUNK_STRIDE as usize)
                    .enumerate()
                {
                    insert.execute(params![id * CHUNK_STRIDE + seq as i64, doc.title, text])?;
                }
            }
            tx.execute("DELETE FROM links WHERE source = ?", [&doc.path])?;
            let mut seen = HashSet::new();
            for target in doc.links.iter().filter(|t| seen.insert(t.as_str())) {
                tx.execute(
                    "INSERT INTO links (source, target) VALUES (?, ?)",
                    params![doc.path, target],
                )?;
            }
        }
        tx.commit()?;
        for doc in docs {
            self.titles.insert(&doc.path, &doc.title);
        }
        Ok(())
    }

    pub fn remove(&mut self, paths: &[String]) -> rusqlite::Result<()> {
        if paths.is_empty() {
            return Ok(());
        }
        let tx = self.db.transaction()?;
        for path in paths {
            let id: Option<i64> = tx
                .query_row("SELECT id FROM files WHERE path = ?", [path], |r| r.get(0))
                .optional()?;
            let Some(id) = id else { continue };
            tx.execute("DELETE FROM fts WHERE rowid = ?", [id])?;
            delete_chunks(&tx, id)?;
            tx.execute("DELETE FROM files WHERE id = ?", [id])?;
            tx.execute("DELETE FROM links WHERE source = ?", [path])?;
        }
        tx.commit()?;
        for path in paths {
            self.titles.remove(path);
        }
        Ok(())
    }

    /// Search with `#tag` tokens and filters; results carry snippets, not content.
    pub fn search(
        &self,
        raw_query: &str,
        filters: &SearchFilters,
    ) -> rusqlite::Result<Vec<SearchResult>> {
        let (text, hash_tags) = parse_search_query(raw_query);
        let mut tags: Vec<String> = Vec::new();
        for t in filters
            .tags
            .iter()
            .flatten()
            .map(|t| t.to_lowercase())
            .chain(hash_tags)
        {
            if !tags.contains(&t) {
                tags.push(t);
            }
        }

        let mut out = Vec::new();
        for hit in self.query(&text)? {
            if !passes(&hit.row, filters, &tags) {
                continue;
            }
            let snippet = build_snippet(&hit.content, &hit.terms, SNIPPET_LEN);
            let (before, hit_text, after) =
                snippet.map_or_else(Default::default, |s| (s.before, s.hit, s.after));
            out.push(SearchResult {
                id: hit.row.path.clone(),
                path: hit.row.path,
                title: hit.row.title,
                kind: hit.row.kind,
                score: hit.score,
                matches: Vec::new(),
                snippet_before: before,
                snippet_hit: hit_text,
                snippet_after: after,
            });
        }
        Ok(out)
    }

    /// The passages that best match `query`, best first, from anywhere in a
    /// file's text (vault chat's retrieval).
    pub fn search_passages(&self, query: &str, limit: i64) -> rusqlite::Result<Vec<PassageHit>> {
        let tokens = tokenize(query);
        if tokens.is_empty() {
            return Ok(Vec::new());
        }
        let sql = format!(
            "SELECT c.rowid AS rid, c.text, {CHUNK_BM25} AS rank, f.path, f.title, f.type
             FROM chunks c JOIN files f ON f.id = c.rowid / {CHUNK_STRIDE}
             WHERE chunks MATCH ? ORDER BY rank LIMIT ?"
        );
        let mut stmt = self.db.prepare(&sql)?;
        let rows = stmt.query_map(params![match_expression(&tokens), limit], |r| {
            let title: String = r.get(4)?;
            let text: String = r.get(1)?;
            Ok(PassageHit {
                path: r.get(3)?,
                seq: r.get::<_, i64>(0)? % CHUNK_STRIDE,
                score: -r.get::<_, f64>(2)?,
                kind: r.get(5)?,
                query_terms: expand_terms(&format!("{title} {text}"), &tokens),
                title,
                text,
            })
        })?;
        rows.collect()
    }

    /// Full-text hits in rank order, then title-only fuzzy hits the full-text
    /// pass missed. An empty query lists every document (used by `#tag`-only
    /// searches, which then filter).
    fn query(&self, text: &str) -> rusqlite::Result<Vec<Hit>> {
        let tokens = tokenize(text);
        if tokens.is_empty() {
            // Punctuation only: nothing to match, unlike an empty query.
            if !js_trim(text).is_empty() {
                return Ok(Vec::new());
            }
            let mut stmt = self.db.prepare(
                "SELECT f.path, f.title, f.type, f.tags, f.mtime, fts.content FROM files f JOIN fts ON fts.rowid = f.id ORDER BY f.path",
            )?;
            let rows = stmt.query_map([], |r| hit_row(r, 1.0, Vec::new()))?;
            return rows.collect();
        }

        let sql = format!(
            "SELECT f.path, f.title, f.type, f.tags, f.mtime, fts.content, {BM25} AS rank
             FROM fts JOIN files f ON f.id = fts.rowid
             WHERE fts MATCH ? ORDER BY rank"
        );
        let mut stmt = self.db.prepare(&sql)?;
        let mut hits: Vec<Hit> = stmt
            .query_map([match_expression(&tokens)], |r| {
                let rank: f64 = r.get(6)?;
                let title: String = r.get(1)?;
                let content: String = r.get(5)?;
                let terms = expand_terms(&format!("{title} {content}"), &tokens);
                hit_row(r, -rank, terms)
            })?
            .collect::<Result<_, _>>()?;

        let seen: HashSet<String> = hits.iter().map(|h| h.row.path.clone()).collect();
        let mut by_path = self.db.prepare(
            "SELECT f.path, f.title, f.type, f.tags, f.mtime, fts.content FROM files f JOIN fts ON fts.rowid = f.id WHERE f.path = ?",
        )?;
        for fuzzy in self
            .titles
            .search(text)
            .into_iter()
            .filter(|h| !seen.contains(&h.path))
        {
            let hit = by_path
                .query_row([&fuzzy.path], |r| {
                    hit_row(r, fuzzy.score, fuzzy.terms.clone())
                })
                .optional()?;
            hits.extend(hit);
        }
        Ok(hits)
    }
}

fn hit_row(r: &rusqlite::Row, score: f64, terms: Vec<String>) -> rusqlite::Result<Hit> {
    Ok(Hit {
        row: FileRow {
            path: r.get(0)?,
            title: r.get(1)?,
            kind: r.get(2)?,
            tags: r.get(3)?,
            mtime: r.get(4)?,
        },
        content: r.get(5)?,
        score,
        terms,
    })
}

fn match_expression(tokens: &[String]) -> String {
    tokens
        .iter()
        .map(|t| format!("\"{}\"*", t.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" OR ")
}

fn passes(row: &FileRow, filters: &SearchFilters, tags: &[String]) -> bool {
    if let Some(types) = &filters.file_type
        && !types.contains(&row.kind)
    {
        return false;
    }
    if let Some(folder) = filters.folder.as_deref().filter(|f| !js_trim(f).is_empty()) {
        let prefix = folder.trim_matches('/');
        let p = row.path.trim_start_matches('/');
        if !p.starts_with(prefix) {
            return false;
        }
    }
    if !tags.is_empty() {
        let doc_tags: HashSet<String> = row
            .tags
            .split(',')
            .map(|t| js_trim(t).to_lowercase())
            .filter(|t| !t.is_empty())
            .collect();
        if !tags.iter().all(|t| doc_tags.contains(t)) {
            return false;
        }
    }
    if filters.modified_from.is_some_and(|from| row.mtime < from) {
        return false;
    }
    if filters.modified_to.is_some_and(|to| row.mtime > to) {
        return false;
    }
    true
}

fn migrate(db: &Connection) -> rusqlite::Result<()> {
    let version: i64 = db.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if version == INDEX_VERSION {
        return Ok(());
    }
    db.execute_batch(&format!(
        "
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
        PRAGMA user_version = {INDEX_VERSION};
        "
    ))
}

fn delete_chunks(db: &Connection, file_id: i64) -> rusqlite::Result<()> {
    db.execute(
        "DELETE FROM chunks WHERE rowid >= ? AND rowid < ?",
        params![file_id * CHUNK_STRIDE, (file_id + 1) * CHUNK_STRIDE],
    )?;
    Ok(())
}

/// Drops a folder's own row, everything recorded beneath it, and its listed marks.
fn forget_folder(db: &Connection, path: &str) -> rusqlite::Result<()> {
    let prefix = format!("{path}/");
    // SQLite's substr counts characters, not UTF-16 units.
    let len = prefix.chars().count() as i64;
    db.execute(
        "DELETE FROM tree WHERE path = ? OR substr(path, 1, ?) = ?",
        params![path, len, prefix],
    )?;
    db.execute(
        "DELETE FROM listed WHERE dir = ? OR substr(dir, 1, ?) = ?",
        params![path, len, prefix],
    )?;
    Ok(())
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as i64)
}

/// A number as JSON the way JavaScript would have written it: whole values
/// without a fraction.
fn num(v: f64) -> serde_json::Value {
    if v.fract() == 0.0 && v.abs() < 9.0e15 {
        serde_json::Value::from(v as i64)
    } else {
        serde_json::Value::from(v)
    }
}
