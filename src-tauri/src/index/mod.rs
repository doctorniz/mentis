//! The native vault index: SQLite (FTS5) behind the same twelve operations the
//! browser build runs in its sqlite-wasm worker (`src/core/index/protocol.ts`).
//! Derived data only; see `store` for the rules.
//!
//! One database per vault, in the app's data folder — never inside the vault,
//! so it is not synced or copied with the user's files.

mod store;
mod text;
mod titles;

use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::Connection;
use serde::Deserialize;
use serde_json::{Value, json};

pub use store::{INDEX_VERSION, IndexStore};

/// Stable, filesystem-safe database name for a vault id (FNV-1a, 64-bit).
pub fn db_file_name(vault_id: &str) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in vault_id.bytes() {
        h ^= u64::from(b);
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("vault-{h:016x}.sqlite3")
}

/// Opens (or creates) the index at `path`. A file that cannot be used —
/// corrupt, or written by something else — is derived data, so it is deleted
/// and started again. If it still cannot be kept on disk the index lives in
/// memory for this session.
fn open_store(path: &Path) -> (IndexStore, bool) {
    if let Some(store) = try_open(path) {
        return (store, true);
    }
    remove_database_files(path);
    if let Some(store) = try_open(path) {
        return (store, true);
    }
    let memory = Connection::open_in_memory().and_then(IndexStore::new);
    (memory.expect("an in-memory database always opens"), false)
}

fn try_open(path: &Path) -> Option<IndexStore> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).ok()?;
    }
    let db = Connection::open(path).ok()?;
    // Reads every page header it needs; a damaged or foreign file fails here.
    let _ = db.pragma_update(None, "journal_mode", "WAL");
    IndexStore::new(db).ok()
}

fn remove_database_files(path: &Path) {
    for suffix in ["", "-wal", "-shm", "-journal"] {
        let mut name = path.as_os_str().to_owned();
        name.push(suffix);
        let _ = fs::remove_file(PathBuf::from(name));
    }
}

/// The index of the open vault, if any, and the calls that reach it.
pub struct IndexHost {
    dir: PathBuf,
    open: Option<(String, IndexStore)>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VaultArg {
    vault_id: String,
}

#[derive(Deserialize)]
struct DocsArg {
    docs: Vec<store::IndexDocument>,
}

#[derive(Deserialize)]
struct PathsArg {
    paths: Vec<String>,
}

#[derive(Deserialize)]
struct SearchArg {
    query: String,
    #[serde(default)]
    filters: Option<store::SearchFilters>,
}

#[derive(Deserialize)]
struct PassagesArg {
    query: String,
    limit: i64,
}

#[derive(Deserialize)]
struct FilesArg {
    files: Vec<store::ManifestEntry>,
}

#[derive(Deserialize)]
struct HashesArg {
    hashes: Vec<store::FileHash>,
}

#[derive(Deserialize)]
struct DirArg {
    dir: String,
}

#[derive(Deserialize)]
struct ListingsArg {
    listings: Vec<store::TreeListing>,
}

fn arg<T: for<'de> Deserialize<'de>>(op: &str, value: Value) -> Result<T, String> {
    serde_json::from_value(value).map_err(|e| format!("bad argument for {op}: {e}"))
}

fn sql(e: rusqlite::Error) -> String {
    e.to_string()
}

fn to_json<T: serde::Serialize>(v: T) -> Result<Value, String> {
    serde_json::to_value(v).map_err(|e| e.to_string())
}

impl IndexHost {
    /// `dir` is where index databases live, e.g. `<app data>/indexes`.
    pub fn new(dir: PathBuf) -> Self {
        Self { dir, open: None }
    }

    fn vault_id(&self) -> Option<&str> {
        self.open.as_ref().map(|(id, _)| id.as_str())
    }

    /// Runs one operation. Writes carry the vault they were meant for; late ones
    /// for a vault that has since been closed are dropped, not applied to the
    /// wrong index. Operations on a closed index answer as an empty one.
    pub fn call(&mut self, op: &str, input: Value) -> Result<Value, String> {
        match op {
            "open" => {
                let VaultArg { vault_id } = arg(op, input)?;
                self.open = None;
                let (store, persisted) = open_store(&self.dir.join(db_file_name(&vault_id)));
                let file_count = store.file_count().map_err(sql)?;
                self.open = Some((vault_id, store));
                Ok(json!({ "persisted": persisted, "fileCount": file_count }))
            }
            "close" => {
                self.open = None;
                Ok(Value::Null)
            }
            "manifest" => match &self.open {
                Some((_, s)) => Ok(Value::Array(s.manifest().map_err(sql)?)),
                None => Ok(json!([])),
            },
            "links" => match &self.open {
                Some((_, s)) => to_json(s.links().map_err(sql)?),
                None => Ok(json!([])),
            },
            "search" => {
                let SearchArg { query, filters } = arg(op, input)?;
                match &self.open {
                    Some((_, s)) => to_json(
                        s.search(&query, &filters.unwrap_or_default())
                            .map_err(sql)?,
                    ),
                    None => Ok(json!([])),
                }
            }
            "searchPassages" => {
                let PassagesArg { query, limit } = arg(op, input)?;
                match &self.open {
                    Some((_, s)) => to_json(s.search_passages(&query, limit).map_err(sql)?),
                    None => Ok(json!([])),
                }
            }
            "children" => {
                let DirArg { dir } = arg(op, input)?;
                match &self.open {
                    Some((_, s)) => Ok(match s.children(&dir).map_err(sql)? {
                        Some(rows) => Value::Array(rows),
                        None => Value::Null,
                    }),
                    None => Ok(Value::Null),
                }
            }
            "upsert" | "remove" | "putHashes" | "setChildren" | "validHashes" => {
                let VaultArg { vault_id } = arg(op, input.clone())?;
                if self.vault_id() != Some(vault_id.as_str()) {
                    return Ok(if op == "validHashes" {
                        json!({})
                    } else {
                        Value::Null
                    });
                }
                let store = &mut self.open.as_mut().expect("checked above").1;
                match op {
                    "upsert" => store
                        .upsert(&arg::<DocsArg>(op, input)?.docs)
                        .map_err(sql)?,
                    "remove" => store
                        .remove(&arg::<PathsArg>(op, input)?.paths)
                        .map_err(sql)?,
                    "putHashes" => store
                        .put_hashes(&arg::<HashesArg>(op, input)?.hashes)
                        .map_err(sql)?,
                    "setChildren" => store
                        .set_children(&arg::<ListingsArg>(op, input)?.listings)
                        .map_err(sql)?,
                    _ => {
                        return to_json(
                            store
                                .valid_hashes(&arg::<FilesArg>(op, input)?.files)
                                .map_err(sql)?,
                        );
                    }
                }
                Ok(Value::Null)
            }
            other => Err(format!("unknown index operation: {other}")),
        }
    }
}

/// Runs the operations without a vault open, on an in-memory store, for the
/// shared fixtures.
#[doc(hidden)]
pub fn in_memory_host() -> IndexHost {
    let mut host = IndexHost::new(PathBuf::new());
    let store = Connection::open_in_memory()
        .and_then(IndexStore::new)
        .expect("an in-memory database always opens");
    host.open = Some(("fixture".to_string(), store));
    host
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mentis-index-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    fn doc(path: &str, content: &str) -> Value {
        json!({ "path": path, "type": "markdown", "title": path, "content": content,
                "tags": [], "size": 1, "mtime": 1 })
    }

    #[test]
    fn names_are_stable_and_per_vault() {
        assert_eq!(db_file_name("tauri:C:/a"), db_file_name("tauri:C:/a"));
        assert_ne!(db_file_name("tauri:C:/a"), db_file_name("tauri:C:/b"));
        assert!(db_file_name("x").ends_with(".sqlite3"));
    }

    #[test]
    fn an_index_survives_closing_and_reopening() {
        let dir = temp_dir("persist");
        let mut host = IndexHost::new(dir.clone());
        let opened = host.call("open", json!({ "vaultId": "v" })).unwrap();
        assert_eq!(opened, json!({ "persisted": true, "fileCount": 0 }));
        host.call(
            "upsert",
            json!({ "vaultId": "v", "docs": [doc("a.md", "hello world")] }),
        )
        .unwrap();
        host.call("close", Value::Null).unwrap();

        let reopened = host.call("open", json!({ "vaultId": "v" })).unwrap();
        assert_eq!(reopened, json!({ "persisted": true, "fileCount": 1 }));
        let found = host.call("search", json!({ "query": "hello" })).unwrap();
        assert_eq!(found[0]["path"], "a.md");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn a_corrupt_database_is_deleted_and_rebuilt() {
        let dir = temp_dir("corrupt");
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join(db_file_name("v")),
            b"this is not a database at all, just text",
        )
        .unwrap();
        let mut host = IndexHost::new(dir.clone());
        let opened = host.call("open", json!({ "vaultId": "v" })).unwrap();
        assert_eq!(opened, json!({ "persisted": true, "fileCount": 0 }));
        host.call(
            "upsert",
            json!({ "vaultId": "v", "docs": [doc("a.md", "text")] }),
        )
        .unwrap();
        assert_eq!(
            host.call("manifest", Value::Null)
                .unwrap()
                .as_array()
                .unwrap()
                .len(),
            1
        );
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn a_different_schema_version_is_rebuilt() {
        let dir = temp_dir("version");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join(db_file_name("v"));
        let db = Connection::open(&path).unwrap();
        db.execute_batch("CREATE TABLE files (x); PRAGMA user_version = 3;")
            .unwrap();
        drop(db);
        let mut host = IndexHost::new(dir.clone());
        host.call("open", json!({ "vaultId": "v" })).unwrap();
        host.call(
            "upsert",
            json!({ "vaultId": "v", "docs": [doc("a.md", "text")] }),
        )
        .unwrap();
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn late_writes_for_another_vault_are_dropped() {
        let mut host = in_memory_host();
        host.call(
            "upsert",
            json!({ "vaultId": "other", "docs": [doc("a.md", "x")] }),
        )
        .unwrap();
        assert_eq!(host.call("manifest", Value::Null).unwrap(), json!([]));
        assert_eq!(
            host.call("validHashes", json!({ "vaultId": "other", "files": [] }))
                .unwrap(),
            json!({})
        );
    }

    #[test]
    fn a_closed_index_answers_as_an_empty_one() {
        let mut host = IndexHost::new(PathBuf::new());
        assert_eq!(
            host.call("search", json!({ "query": "x" })).unwrap(),
            json!([])
        );
        assert_eq!(
            host.call("children", json!({ "dir": "" })).unwrap(),
            Value::Null
        );
        assert_eq!(host.call("manifest", Value::Null).unwrap(), json!([]));
    }

    #[test]
    fn unknown_operations_and_bad_arguments_are_errors() {
        let mut host = in_memory_host();
        assert!(host.call("nope", Value::Null).is_err());
        assert!(host.call("search", json!({ "limit": 1 })).is_err());
    }
}
