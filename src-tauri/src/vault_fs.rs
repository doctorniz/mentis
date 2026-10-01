//! File access for an open vault. Every command takes the vault's root folder
//! and a vault-relative path; a root is only usable after the app has granted
//! it (from a folder the user picked), and a path can never leave its root.
//!
//! Commands are async so they run off the UI thread.

use std::collections::HashSet;
use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

use serde::Serialize;
use tauri::State;
use tauri::ipc::{InvokeBody, Request, Response};

#[derive(Default)]
pub struct VaultRoots(Mutex<HashSet<PathBuf>>);

impl VaultRoots {
    /// Lets commands use `root`. Called only for folders the user chose.
    pub fn grant(&self, root: &Path) -> io::Result<PathBuf> {
        let canonical = fs::canonicalize(root)?;
        self.0.lock().unwrap().insert(canonical.clone());
        Ok(canonical)
    }

    pub fn revoke(&self, root: &Path) {
        if let Ok(canonical) = fs::canonicalize(root) {
            self.0.lock().unwrap().remove(&canonical);
        }
    }

    fn resolve(&self, root: &str, rel: &str) -> Result<PathBuf, String> {
        let root = fs::canonicalize(root).map_err(|e| format!("vault folder unavailable: {e}"))?;
        if !self.0.lock().unwrap().contains(&root) {
            return Err("vault folder has not been opened".into());
        }
        resolve_in(&root, rel)
    }
}

/// `rel` joined onto `root`, refusing anything that could land outside it:
/// absolute paths, `..`, drive prefixes, alternate data streams, and symlinks
/// that point out of the vault.
pub fn resolve_in(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel = rel.trim_matches('/');
    let mut path = root.to_path_buf();
    for seg in rel.split('/').filter(|s| !s.is_empty()) {
        let bad = seg == "."
            || seg == ".."
            || seg.contains('\\')
            || seg.contains(':')
            || !matches!(
                Path::new(seg).components().next(),
                Some(Component::Normal(_))
            );
        if bad {
            return Err(format!("invalid vault path: {rel}"));
        }
        path.push(seg);
    }

    // The deepest part that exists must still be inside the root once links
    // are followed.
    let mut existing = path.as_path();
    while !existing.exists() {
        match existing.parent() {
            Some(parent) => existing = parent,
            None => break,
        }
    }
    let real = fs::canonicalize(existing).map_err(|e| e.to_string())?;
    if !real.starts_with(root) {
        return Err(format!("path leaves the vault: {rel}"));
    }
    Ok(path)
}

fn err(e: io::Error) -> String {
    e.to_string()
}

fn millis(t: io::Result<std::time::SystemTime>) -> Option<f64> {
    t.ok()?
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|d| d.as_millis() as f64)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stat {
    size: u64,
    is_directory: bool,
    mtime: Option<f64>,
    birthtime: Option<f64>,
}

fn stat_of(meta: &fs::Metadata) -> Stat {
    Stat {
        size: meta.len(),
        is_directory: meta.is_dir(),
        mtime: millis(meta.modified()),
        birthtime: millis(meta.created()),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    name: String,
    #[serde(flatten)]
    stat: Stat,
}

#[tauri::command]
pub async fn vault_read(
    roots: State<'_, VaultRoots>,
    root: String,
    path: String,
) -> Result<Response, String> {
    let full = roots.resolve(&root, &path)?;
    fs::read(full).map(Response::new).map_err(err)
}

/// The bytes travel as the raw request body; root and path as headers.
#[tauri::command]
pub async fn vault_write(roots: State<'_, VaultRoots>, request: Request<'_>) -> Result<(), String> {
    let header = |name: &str| -> Result<String, String> {
        let raw = request
            .headers()
            .get(name)
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| format!("missing {name}"))?;
        urlencoding_decode(raw)
    };
    let full = roots.resolve(&header("x-vault-root")?, &header("x-vault-path")?)?;
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw bytes".into());
    };
    fs::write(full, bytes).map_err(err)
}

fn urlencoding_decode(s: &str) -> Result<String, String> {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).map_err(|e| e.to_string())?;
            out.push(u8::from_str_radix(hex, 16).map_err(|e| e.to_string())?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn vault_exists(
    roots: State<'_, VaultRoots>,
    root: String,
    path: String,
) -> Result<bool, String> {
    Ok(roots.resolve(&root, &path).is_ok_and(|p| p.exists()))
}

#[tauri::command]
pub async fn vault_stat(
    roots: State<'_, VaultRoots>,
    root: String,
    path: String,
) -> Result<Stat, String> {
    let full = roots.resolve(&root, &path)?;
    fs::metadata(full).map(|m| stat_of(&m)).map_err(err)
}

#[tauri::command]
pub async fn vault_mkdir(
    roots: State<'_, VaultRoots>,
    root: String,
    path: String,
) -> Result<(), String> {
    fs::create_dir_all(roots.resolve(&root, &path)?).map_err(err)
}

/// One call per folder, with each entry's size and times, so listing a folder
/// never needs a round trip per file.
#[tauri::command]
pub async fn vault_read_dir(
    roots: State<'_, VaultRoots>,
    root: String,
    path: String,
) -> Result<Vec<DirEntry>, String> {
    let full = roots.resolve(&root, &path)?;
    let mut out = Vec::new();
    for entry in fs::read_dir(full).map_err(err)? {
        let entry = entry.map_err(err)?;
        let Ok(name) = entry.file_name().into_string() else {
            continue;
        };
        // Follows symlinks, as the browser adapters see the target.
        let Ok(meta) = fs::metadata(entry.path()) else {
            continue;
        };
        out.push(DirEntry {
            name,
            stat: stat_of(&meta),
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn vault_rename(
    roots: State<'_, VaultRoots>,
    root: String,
    from: String,
    to: String,
) -> Result<(), String> {
    let from = roots.resolve(&root, &from)?;
    let to = roots.resolve(&root, &to)?;
    fs::rename(from, to).map_err(err)
}

#[tauri::command]
pub async fn vault_copy(
    roots: State<'_, VaultRoots>,
    root: String,
    from: String,
    to: String,
) -> Result<(), String> {
    let from = roots.resolve(&root, &from)?;
    let to = roots.resolve(&root, &to)?;
    fs::copy(from, to).map(|_| ()).map_err(err)
}

/// A file, or an empty folder.
#[tauri::command]
pub async fn vault_remove(
    roots: State<'_, VaultRoots>,
    root: String,
    path: String,
) -> Result<(), String> {
    let full = roots.resolve(&root, &path)?;
    if fs::symlink_metadata(&full).map_err(err)?.is_dir() {
        fs::remove_dir(full).map_err(err)
    } else {
        fs::remove_file(full).map_err(err)
    }
}

#[tauri::command]
pub async fn vault_remove_dir(
    roots: State<'_, VaultRoots>,
    root: String,
    path: String,
) -> Result<(), String> {
    if path.trim_matches('/').is_empty() {
        return Err("refusing to remove the vault folder itself".into());
    }
    fs::remove_dir_all(roots.resolve(&root, &path)?).map_err(err)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "mentis-vault-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(dir.join("notes")).unwrap();
        fs::canonicalize(dir).unwrap()
    }

    #[test]
    fn resolves_plain_vault_paths() {
        let root = temp_root();
        assert_eq!(
            resolve_in(&root, "notes/a.md").unwrap(),
            root.join("notes").join("a.md")
        );
        assert_eq!(resolve_in(&root, "/notes/").unwrap(), root.join("notes"));
        assert_eq!(resolve_in(&root, "").unwrap(), root);
        // Parents that do not exist yet are fine; mkdir creates them.
        assert!(resolve_in(&root, "new/deeper/x.md").is_ok());
    }

    #[test]
    fn refuses_paths_that_leave_the_vault() {
        let root = temp_root();
        for bad in [
            "../x",
            "notes/../../x",
            "./x",
            "C:/Windows",
            "a\\..\\b",
            "notes/a.md:stream",
        ] {
            assert!(resolve_in(&root, bad).is_err(), "{bad} should be refused");
        }
    }

    #[test]
    fn ungranted_roots_are_refused() {
        let roots = VaultRoots::default();
        let root = temp_root();
        let root_str = root.to_string_lossy().to_string();
        assert!(roots.resolve(&root_str, "notes").is_err());
        roots.grant(&root).unwrap();
        assert!(roots.resolve(&root_str, "notes").is_ok());
    }

    #[test]
    fn decodes_percent_encoded_headers() {
        assert_eq!(urlencoding_decode("a%20b%2Fc").unwrap(), "a b/c");
        assert_eq!(urlencoding_decode("%E2%9C%93").unwrap(), "✓");
        assert_eq!(urlencoding_decode("plain").unwrap(), "plain");
    }
}
