//! Vaults in a folder picked through Android's Storage Access Framework. Such a
//! folder has no file path the app may use: it is a `content://` tree URI, and
//! every file in it is reached through Android's content resolver. The Kotlin
//! side (`SafPlugin.kt`) does that; this module is the Rust end of it.
//!
//! A vault root here is the tree URI, optionally followed by `|` and a folder
//! inside it (a vault created inside a picked parent folder). Reads and writes
//! do not pass the bytes through IPC: Kotlin opens the document and hands back
//! a file descriptor in this process.

use std::sync::Arc;

use serde::{Deserialize, Serialize};

/// Root strings of SAF vaults start with this.
pub const SCHEME: &str = "content://";

pub fn is_saf(root: &str) -> bool {
    root.starts_with(SCHEME)
}

/// The tree URI and the vault-relative path joined onto the root's own folder.
pub fn split(root: &str, rel: &str) -> (String, String) {
    let (tree, base) = root.split_once('|').unwrap_or((root, ""));
    let rel = rel.trim_matches('/');
    let path = match (base.trim_matches('/'), rel) {
        ("", r) => r.to_string(),
        (b, "") => b.to_string(),
        (b, r) => format!("{b}/{r}"),
    };
    (tree.to_string(), path)
}

/// Refuse segments that could step outside the vault or mean something else
/// to a document provider.
pub fn check_rel(rel: &str) -> Result<(), String> {
    for seg in rel.trim_matches('/').split('/').filter(|s| !s.is_empty()) {
        if seg == "." || seg == ".." || seg.contains('\\') || seg.contains('|') {
            return Err(format!("invalid vault path: {rel}"));
        }
    }
    Ok(())
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SafStat {
    pub is_directory: bool,
    pub size: u64,
    pub mtime: Option<f64>,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SafEntry {
    pub name: String,
    #[serde(flatten)]
    pub stat: SafStat,
}

/// A folder the user picked: its root string and a name to show.
#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct Picked {
    pub root: String,
    pub name: String,
}

/// What the platform must provide for SAF vaults.
pub trait SafBackend: Send + Sync {
    fn pick_folder(&self) -> Result<Option<Picked>, String>;
    /// Pick a parent folder and create `name` in it.
    fn create_folder(&self, name: &str) -> Result<Option<Picked>, String>;
    fn stat(&self, tree: &str, path: &str) -> Result<Option<SafStat>, String>;
    fn list(&self, tree: &str, path: &str) -> Result<Vec<SafEntry>, String>;
    fn mkdirs(&self, tree: &str, path: &str) -> Result<(), String>;
    /// A file descriptor for `path`, opened for reading, or for writing
    /// (created, with its folders, and truncated).
    fn open_fd(&self, tree: &str, path: &str, write: bool) -> Result<i32, String>;
    fn rename(&self, tree: &str, from: &str, to: &str) -> Result<(), String>;
    /// A file, or a folder with everything in it.
    fn delete(&self, tree: &str, path: &str) -> Result<(), String>;
    /// Whether the app may still use the tree (the grant can be revoked).
    fn available(&self, tree: &str) -> bool;
}

/// The SAF backend, where the platform has one.
#[derive(Default, Clone)]
pub struct Saf(pub Option<Arc<dyn SafBackend>>);

impl Saf {
    pub fn get(&self) -> Result<&dyn SafBackend, String> {
        self.0
            .as_deref()
            .ok_or_else(|| "Picked folders are not supported on this platform.".to_string())
    }
}

/// Read a whole file through a descriptor from the backend.
#[cfg(unix)]
pub fn read(backend: &dyn SafBackend, tree: &str, path: &str) -> Result<Vec<u8>, String> {
    use std::io::Read;
    let mut file = file_from(backend.open_fd(tree, path, false)?);
    let mut out = Vec::new();
    file.read_to_end(&mut out).map_err(|e| e.to_string())?;
    Ok(out)
}

/// Replace a file's contents through a descriptor from the backend.
#[cfg(unix)]
pub fn write(backend: &dyn SafBackend, tree: &str, path: &str, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let mut file = file_from(backend.open_fd(tree, path, true)?);
    file.write_all(bytes).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())
}

#[cfg(unix)]
fn file_from(fd: i32) -> std::fs::File {
    use std::os::fd::FromRawFd;
    // SAFETY: the descriptor was detached for us by the Kotlin side and is
    // owned by nothing else; the File closes it.
    unsafe { std::fs::File::from_raw_fd(fd) }
}

#[cfg(not(unix))]
pub fn read(_: &dyn SafBackend, _: &str, _: &str) -> Result<Vec<u8>, String> {
    Err("Picked folders are not supported on this platform.".into())
}

#[cfg(not(unix))]
pub fn write(_: &dyn SafBackend, _: &str, _: &str, _: &[u8]) -> Result<(), String> {
    Err("Picked folders are not supported on this platform.".into())
}

#[cfg(target_os = "android")]
mod android {
    use super::*;
    use serde_json::json;
    use tauri::Runtime;
    use tauri::plugin::PluginHandle;

    pub struct AndroidSaf<R: Runtime>(pub PluginHandle<R>);

    #[derive(Deserialize)]
    struct Fd {
        fd: i32,
    }

    #[derive(Deserialize)]
    struct MaybePicked {
        picked: Option<Picked>,
    }

    #[derive(Deserialize)]
    struct MaybeStat {
        stat: Option<SafStat>,
    }

    #[derive(Deserialize)]
    struct Entries {
        entries: Vec<SafEntry>,
    }

    #[derive(Deserialize)]
    struct Flag {
        value: bool,
    }

    impl<R: Runtime> AndroidSaf<R> {
        fn call<T: serde::de::DeserializeOwned>(
            &self,
            cmd: &str,
            args: serde_json::Value,
        ) -> Result<T, String> {
            self.0
                .run_mobile_plugin::<T>(cmd, args)
                .map_err(|e| e.to_string())
        }
    }

    impl<R: Runtime> SafBackend for AndroidSaf<R> {
        fn pick_folder(&self) -> Result<Option<Picked>, String> {
            Ok(self.call::<MaybePicked>("pickFolder", json!({}))?.picked)
        }
        fn create_folder(&self, name: &str) -> Result<Option<Picked>, String> {
            Ok(self
                .call::<MaybePicked>("createFolder", json!({ "name": name }))?
                .picked)
        }
        fn stat(&self, tree: &str, path: &str) -> Result<Option<SafStat>, String> {
            Ok(self
                .call::<MaybeStat>("stat", json!({ "tree": tree, "path": path }))?
                .stat)
        }
        fn list(&self, tree: &str, path: &str) -> Result<Vec<SafEntry>, String> {
            Ok(self
                .call::<Entries>("list", json!({ "tree": tree, "path": path }))?
                .entries)
        }
        fn mkdirs(&self, tree: &str, path: &str) -> Result<(), String> {
            self.call::<serde_json::Value>("mkdirs", json!({ "tree": tree, "path": path }))
                .map(|_| ())
        }
        fn open_fd(&self, tree: &str, path: &str, write: bool) -> Result<i32, String> {
            Ok(self
                .call::<Fd>(
                    "openFd",
                    json!({ "tree": tree, "path": path, "write": write }),
                )?
                .fd)
        }
        fn rename(&self, tree: &str, from: &str, to: &str) -> Result<(), String> {
            self.call::<serde_json::Value>(
                "rename",
                json!({ "tree": tree, "from": from, "to": to }),
            )
            .map(|_| ())
        }
        fn delete(&self, tree: &str, path: &str) -> Result<(), String> {
            self.call::<serde_json::Value>("delete", json!({ "tree": tree, "path": path }))
                .map(|_| ())
        }
        fn available(&self, tree: &str) -> bool {
            self.call::<Flag>("available", json!({ "tree": tree }))
                .is_ok_and(|f| f.value)
        }
    }
}

/// The plugin that registers the Kotlin side and puts the backend in state.
#[cfg(mobile)]
pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("saf")
        .setup(|app, api| {
            use tauri::Manager;
            #[cfg(target_os = "android")]
            {
                let handle = api.register_android_plugin("app.mentis", "SafPlugin")?;
                app.manage(Saf(Some(Arc::new(android::AndroidSaf(handle)))));
            }
            #[cfg(not(target_os = "android"))]
            {
                let _ = api;
                app.manage(Saf::default());
            }
            Ok(())
        })
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_roots_with_and_without_a_folder_inside() {
        let tree = "content://com.android.externalstorage.documents/tree/primary%3ADocuments";
        assert_eq!(
            split(tree, "a/b.md"),
            (tree.to_string(), "a/b.md".to_string())
        );
        assert_eq!(split(tree, ""), (tree.to_string(), String::new()));
        let root = format!("{tree}|My Vault");
        assert_eq!(
            split(&root, "/a.md"),
            (tree.to_string(), "My Vault/a.md".to_string())
        );
        assert_eq!(split(&root, ""), (tree.to_string(), "My Vault".to_string()));
    }

    #[test]
    fn refuses_paths_that_step_out() {
        assert!(check_rel("notes/a.md").is_ok());
        assert!(check_rel("../a.md").is_err());
        assert!(check_rel("a/./b").is_err());
        assert!(check_rel("a|b").is_err());
    }

    #[test]
    fn a_platform_without_a_backend_says_so() {
        assert!(Saf::default().get().is_err());
        assert!(is_saf("content://x") && !is_saf("C:/Vault"));
    }
}
