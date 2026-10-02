//! Tells the window when something outside the app changed the vault (another
//! program, a sync client, git), so it can re-scan in the background.
//!
//! The event carries no paths. Re-scanning compares file metadata against the
//! index and finds what changed itself; the watcher only says "look again".

use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::sync::mpsc::{self, RecvTimeoutError};
use std::thread;
use std::time::Duration;

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, Runtime, State};

use crate::vault_fs::VaultRoots;

/// Event name the window listens for.
pub const EVENT: &str = "vault-changed";

/// How long the vault must stay quiet before one change is announced.
const QUIET: Duration = Duration::from_millis(300);

/// Whether an event could change what the vault lists or holds. Reads and
/// opens cannot; `.git` is a repository's own bookkeeping, not the user's files.
fn relevant(event: &Event, root: &Path) -> bool {
    if matches!(event.kind, EventKind::Access(_)) {
        return false;
    }
    event.paths.is_empty()
        || event.paths.iter().any(|p| {
            !p.strip_prefix(root)
                .unwrap_or(p)
                .components()
                .any(|c| c == Component::Normal(".git".as_ref()))
        })
}

/// Collapses bursts: after the first signal, waits until `quiet` passes with
/// no more, then calls `emit` once. Ends when every sender is gone.
fn coalesce(rx: mpsc::Receiver<()>, quiet: Duration, emit: impl Fn()) {
    while rx.recv().is_ok() {
        loop {
            match rx.recv_timeout(quiet) {
                Ok(()) => {}
                Err(RecvTimeoutError::Timeout) => break,
                Err(RecvTimeoutError::Disconnected) => return,
            }
        }
        emit();
    }
}

/// Watches `root` and its subfolders, calling `on_change` once per burst of
/// changes. Dropping the watcher stops it.
pub fn watch(
    root: &Path,
    quiet: Duration,
    on_change: impl Fn() + Send + 'static,
) -> notify::Result<RecommendedWatcher> {
    let (tx, rx) = mpsc::channel();
    let base = root.to_path_buf();
    let mut watcher = notify::recommended_watcher(move |event: notify::Result<Event>| {
        // A watcher error may mean missed events, so it asks for a re-scan too.
        if event.as_ref().map_or(true, |e| relevant(e, &base)) {
            let _ = tx.send(());
        }
    })?;
    watcher.watch(root, RecursiveMode::Recursive)?;
    thread::spawn(move || coalesce(rx, quiet, on_change));
    Ok(watcher)
}

/// The one active watcher: the open vault's.
#[derive(Default)]
pub struct VaultWatcher(Mutex<Option<RecommendedWatcher>>);

impl VaultWatcher {
    fn replace(&self, next: Option<RecommendedWatcher>) {
        *self.0.lock().unwrap_or_else(|e| e.into_inner()) = next;
    }
}

#[tauri::command]
pub async fn vault_watch_start<R: Runtime>(
    app: AppHandle<R>,
    roots: State<'_, VaultRoots>,
    watcher: State<'_, VaultWatcher>,
    root: String,
) -> Result<(), String> {
    let root: PathBuf = roots.resolve(&root, "")?;
    // Stop the previous vault's watcher first; two would double every event.
    watcher.replace(None);
    let next = watch(&root, QUIET, move || {
        let _ = app.emit(EVENT, ());
    })
    .map_err(|e| format!("cannot watch the vault folder: {e}"))?;
    watcher.replace(Some(next));
    Ok(())
}

#[tauri::command]
pub async fn vault_watch_stop(watcher: State<'_, VaultWatcher>) -> Result<(), String> {
    watcher.replace(None);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::Instant;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mentis-watch-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::canonicalize(&dir).unwrap()
    }

    fn event(kind: EventKind, path: &str) -> Event {
        Event::new(kind).add_path(PathBuf::from(path))
    }

    #[test]
    fn reads_and_git_bookkeeping_are_not_changes() {
        use notify::event::{AccessKind, CreateKind};
        let root = Path::new("/v");
        let create = EventKind::Create(CreateKind::File);
        assert!(relevant(&event(create, "/v/a.md"), root));
        assert!(relevant(&event(create, "/v/notes/deep/a.md"), root));
        assert!(!relevant(
            &event(EventKind::Access(AccessKind::Any), "/v/a.md"),
            root
        ));
        assert!(!relevant(&event(create, "/v/.git/index.lock"), root));
        assert!(!relevant(&event(create, "/v/sub/.git/HEAD"), root));
        assert!(relevant(&event(create, "/v/.github/x.md"), root));
        assert!(relevant(&Event::new(EventKind::Other), root));
    }

    #[test]
    fn a_burst_becomes_one_signal() {
        let (tx, rx) = mpsc::channel();
        let count = Arc::new(AtomicUsize::new(0));
        let seen = Arc::clone(&count);
        let worker = thread::spawn(move || {
            coalesce(rx, Duration::from_millis(60), || {
                seen.fetch_add(1, Ordering::SeqCst);
            })
        });
        for _ in 0..10 {
            tx.send(()).unwrap();
            thread::sleep(Duration::from_millis(10));
        }
        thread::sleep(Duration::from_millis(200));
        assert_eq!(count.load(Ordering::SeqCst), 1);
        tx.send(()).unwrap();
        thread::sleep(Duration::from_millis(200));
        assert_eq!(count.load(Ordering::SeqCst), 2);
        drop(tx);
        worker.join().unwrap();
    }

    /// Waits for the count to reach `at_least`; a late signal is fine, a
    /// missing one is not.
    fn wait_for(count: &AtomicUsize, at_least: usize) -> bool {
        let until = Instant::now() + Duration::from_secs(10);
        while Instant::now() < until {
            if count.load(Ordering::SeqCst) >= at_least {
                return true;
            }
            thread::sleep(Duration::from_millis(25));
        }
        false
    }

    #[test]
    fn changes_on_disk_are_announced() {
        let dir = temp_dir("disk");
        fs::create_dir_all(dir.join("notes/sub")).unwrap();
        let count = Arc::new(AtomicUsize::new(0));
        let seen = Arc::clone(&count);
        let _watcher = watch(&dir, Duration::from_millis(100), move || {
            seen.fetch_add(1, Ordering::SeqCst);
        })
        .unwrap();

        let mut expected = 0;
        let mut step = |what: &str, act: &dyn Fn()| {
            act();
            expected += 1;
            assert!(wait_for(&count, expected), "no signal after {what}");
            thread::sleep(Duration::from_millis(250));
        };
        step("create", &|| {
            fs::write(dir.join("notes/a.md"), "one").unwrap()
        });
        step("edit in a subfolder", &|| {
            fs::write(dir.join("notes/a.md"), "two").unwrap()
        });
        step("rename", &|| {
            fs::rename(dir.join("notes/a.md"), dir.join("notes/sub/b.md")).unwrap()
        });
        step("delete", &|| {
            fs::remove_file(dir.join("notes/sub/b.md")).unwrap()
        });
        step("a new folder", &|| {
            fs::create_dir(dir.join("fresh")).unwrap()
        });
        step("a file in the new folder", &|| {
            fs::write(dir.join("fresh/c.md"), "x").unwrap()
        });

        // Writes inside .git stay silent.
        fs::create_dir_all(dir.join(".git")).unwrap();
        thread::sleep(Duration::from_millis(400));
        let before = count.load(Ordering::SeqCst);
        fs::write(dir.join(".git/index"), "x").unwrap();
        thread::sleep(Duration::from_millis(600));
        assert_eq!(count.load(Ordering::SeqCst), before);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn stopping_ends_the_signals() {
        let dir = temp_dir("stop");
        let count = Arc::new(AtomicUsize::new(0));
        let seen = Arc::clone(&count);
        let watcher = watch(&dir, Duration::from_millis(50), move || {
            seen.fetch_add(1, Ordering::SeqCst);
        })
        .unwrap();
        drop(watcher);
        thread::sleep(Duration::from_millis(100));
        fs::write(dir.join("a.md"), "x").unwrap();
        thread::sleep(Duration::from_millis(400));
        assert_eq!(count.load(Ordering::SeqCst), 0);
        let _ = fs::remove_dir_all(&dir);
    }
}
