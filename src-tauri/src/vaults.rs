//! Which folders are vaults: the folder dialog, creating a vault folder, and
//! the recent-vaults list. A folder becomes usable by the `vault_*` file
//! commands only through here, so web content can never name its own folder.
//!
//! The recent list is app state, not user data: it lives in the app's data
//! folder, and losing it only means picking the folder again.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_dialog::DialogExt;

use crate::vault_fs::VaultRoots;

const RECENT_FILE: &str = "recent-vaults.json";
const MAX_RECENT: usize = 20;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RecentEntry {
    pub path: String,
    pub opened_at: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentVault {
    path: String,
    name: String,
    available: bool,
}

/// The recent list, most recent first, backed by a JSON file.
pub struct Recents {
    file: PathBuf,
    entries: Mutex<Vec<RecentEntry>>,
}

impl Recents {
    pub fn load(file: PathBuf) -> Self {
        let entries = fs::read(&file)
            .ok()
            .and_then(|b| serde_json::from_slice::<Vec<RecentEntry>>(&b).ok())
            .unwrap_or_default();
        Self {
            file,
            entries: Mutex::new(entries),
        }
    }

    pub fn paths(&self) -> Vec<String> {
        self.entries
            .lock()
            .unwrap()
            .iter()
            .map(|e| e.path.clone())
            .collect()
    }

    fn contains(&self, path: &str) -> bool {
        self.entries
            .lock()
            .unwrap()
            .iter()
            .any(|e| same_path(&e.path, path))
    }

    fn touch(&self, path: &str) {
        let mut entries = self.entries.lock().unwrap();
        entries.retain(|e| !same_path(&e.path, path));
        entries.insert(
            0,
            RecentEntry {
                path: path.to_string(),
                opened_at: now_ms(),
            },
        );
        entries.truncate(MAX_RECENT);
        self.save(&entries);
    }

    fn forget(&self, path: &str) {
        let mut entries = self.entries.lock().unwrap();
        entries.retain(|e| !same_path(&e.path, path));
        self.save(&entries);
    }

    fn save(&self, entries: &[RecentEntry]) {
        if let Some(dir) = self.file.parent() {
            let _ = fs::create_dir_all(dir);
        }
        if let Ok(json) = serde_json::to_vec_pretty(entries) {
            let _ = fs::write(&self.file, json);
        }
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn same_path(a: &str, b: &str) -> bool {
    if cfg!(windows) {
        a.eq_ignore_ascii_case(b)
    } else {
        a == b
    }
}

/// A canonical path without Windows' `\\?\` prefix, for storage and display.
pub fn display_path(path: &Path) -> String {
    let s = path.to_string_lossy();
    s.strip_prefix(r"\\?\").unwrap_or(&s).to_string()
}

fn folder_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string())
}

/// A name that is safe as a single folder name on every desktop OS.
pub fn valid_folder_name(name: &str) -> Result<String, String> {
    let name = name.trim().trim_end_matches('.').trim();
    let bad = name.is_empty()
        || name == "."
        || name == ".."
        || name
            .chars()
            .any(|c| c.is_control() || r#"<>:"/\|?*"#.contains(c));
    let reserved = {
        let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
        matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
            || ((stem.starts_with("COM") || stem.starts_with("LPT"))
                && stem.len() == 4
                && stem.as_bytes()[3].is_ascii_digit())
    };
    if bad || reserved {
        return Err(format!("\"{name}\" cannot be used as a folder name."));
    }
    Ok(name.to_string())
}

fn open(roots: &VaultRoots, recents: &Recents, folder: &Path) -> Result<String, String> {
    let canonical = roots.grant(folder).map_err(|e| e.to_string())?;
    let path = display_path(&canonical);
    recents.touch(&path);
    Ok(path)
}

/// Grants every remembered folder that still exists, so reopening the last
/// vault needs no dialog.
pub fn grant_recent(roots: &VaultRoots, recents: &Recents) {
    for path in recents.paths() {
        let _ = roots.grant(Path::new(&path));
    }
}

pub fn recents_file<R: Runtime>(app: &AppHandle<R>) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("mentis"))
        .join(RECENT_FILE)
}

#[tauri::command]
pub async fn vault_recent(recents: State<'_, Recents>) -> Result<Vec<RecentVault>, String> {
    Ok(recents
        .paths()
        .into_iter()
        .map(|path| RecentVault {
            name: folder_name(&path),
            available: Path::new(&path).is_dir(),
            path,
        })
        .collect())
}

/// Asks for a folder. `None` when the user cancels.
#[tauri::command]
pub async fn vault_pick_folder<R: Runtime>(
    app: AppHandle<R>,
    roots: State<'_, VaultRoots>,
    recents: State<'_, Recents>,
) -> Result<Option<String>, String> {
    let Some(picked) = app
        .dialog()
        .file()
        .set_title("Open a folder as a vault")
        .blocking_pick_folder()
    else {
        return Ok(None);
    };
    let folder = picked.into_path().map_err(|e| e.to_string())?;
    open(&roots, &recents, &folder).map(Some)
}

/// Asks where to put a new vault, then creates a folder called `name` there.
/// `None` when the user cancels.
#[tauri::command]
pub async fn vault_create<R: Runtime>(
    app: AppHandle<R>,
    roots: State<'_, VaultRoots>,
    recents: State<'_, Recents>,
    name: String,
) -> Result<Option<String>, String> {
    let name = valid_folder_name(&name)?;
    let Some(picked) = app
        .dialog()
        .file()
        .set_title(format!("Choose where to create \"{name}\""))
        .blocking_pick_folder()
    else {
        return Ok(None);
    };
    let parent = picked.into_path().map_err(|e| e.to_string())?;
    let folder = parent.join(&name);
    if folder.exists() {
        return Err(format!(
            "A folder named \"{name}\" already exists there. Open it instead, or choose another name."
        ));
    }
    fs::create_dir(&folder).map_err(|e| e.to_string())?;
    open(&roots, &recents, &folder).map(Some)
}

/// Reopens a folder from the recent list. Only listed folders can be opened
/// this way.
#[tauri::command]
pub async fn vault_open_recent(
    roots: State<'_, VaultRoots>,
    recents: State<'_, Recents>,
    path: String,
) -> Result<String, String> {
    if !recents.contains(&path) {
        return Err("That folder is not in the recent list.".into());
    }
    let folder = Path::new(&path);
    if !folder.is_dir() {
        return Err(format!("The folder {path} is no longer available."));
    }
    open(&roots, &recents, folder)
}

/// Removes a folder from the recent list. The folder itself is untouched.
#[tauri::command]
pub async fn vault_forget(
    roots: State<'_, VaultRoots>,
    recents: State<'_, Recents>,
    path: String,
) -> Result<(), String> {
    recents.forget(&path);
    roots.revoke(Path::new(&path));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_file() -> PathBuf {
        static NEXT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let n = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        std::env::temp_dir()
            .join(format!(
                "mentis-recents-{}-{}-{n}",
                std::process::id(),
                now_ms()
            ))
            .join(RECENT_FILE)
    }

    #[test]
    fn recents_are_most_recent_first_deduplicated_and_persisted() {
        let file = temp_file();
        let recents = Recents::load(file.clone());
        recents.touch("C:/a");
        recents.touch("C:/b");
        recents.touch("C:/a");
        assert_eq!(recents.paths(), vec!["C:/a", "C:/b"]);

        let reloaded = Recents::load(file.clone());
        assert_eq!(reloaded.paths(), vec!["C:/a", "C:/b"]);
        reloaded.forget("C:/a");
        assert_eq!(Recents::load(file).paths(), vec!["C:/b"]);
    }

    #[test]
    fn recents_are_capped() {
        let recents = Recents::load(temp_file());
        for i in 0..(MAX_RECENT + 5) {
            recents.touch(&format!("/v{i}"));
        }
        assert_eq!(recents.paths().len(), MAX_RECENT);
        assert_eq!(recents.paths()[0], format!("/v{}", MAX_RECENT + 4));
    }

    #[test]
    fn an_unreadable_recent_file_is_an_empty_list() {
        let file = temp_file();
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(&file, b"not json").unwrap();
        assert!(Recents::load(file).paths().is_empty());
    }

    #[test]
    fn folder_names_are_checked() {
        assert_eq!(valid_folder_name("  My Vault  ").unwrap(), "My Vault");
        for bad in [
            "", "  ", ".", "..", "a/b", "a\\b", "a:b", "what?", "CON", "com1", "lpt9.txt",
        ] {
            assert!(valid_folder_name(bad).is_err(), "{bad:?} should be refused");
        }
        assert!(valid_folder_name("Console").is_ok());
        assert!(valid_folder_name("COM10").is_ok());
    }

    #[test]
    fn display_paths_drop_the_verbatim_prefix() {
        assert_eq!(
            display_path(Path::new(r"\\?\C:\Users\me\Vault")),
            r"C:\Users\me\Vault"
        );
        assert_eq!(display_path(Path::new("/home/me/Vault")), "/home/me/Vault");
    }
}
