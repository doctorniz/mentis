//! Cold-start measurement for CI. When `MENTIS_STARTUP_REPORT` names a file, the
//! window's "shell is up" signal writes the wall-clock time there and quits;
//! the launcher compares it with the time it spawned the process. Without the
//! variable the signal does nothing.

use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Runtime};

pub const REPORT_ENV: &str = "MENTIS_STARTUP_REPORT";

/// Writes `{"readyAtMs": <unix ms>}` to `report`, if one was asked for.
/// Returns whether a report was written.
fn write_report(report: Option<&Path>, now_ms: u128) -> bool {
    let Some(path) = report else {
        return false;
    };
    std::fs::write(path, format!("{{\"readyAtMs\":{now_ms}}}")).is_ok()
}

#[tauri::command]
pub fn startup_ready<R: Runtime>(app: AppHandle<R>) {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis());
    let requested = std::env::var_os(REPORT_ENV);
    if write_report(requested.as_deref().map(Path::new), now) {
        app.exit(0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nothing_is_written_unless_asked() {
        assert!(!write_report(None, 5));
    }

    #[test]
    fn the_time_is_written_where_asked() {
        let file = std::env::temp_dir().join(format!("mentis-startup-{}.json", std::process::id()));
        assert!(write_report(Some(&file), 1_700_000_000_123));
        let json: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&file).unwrap()).unwrap();
        assert_eq!(json["readyAtMs"], 1_700_000_000_123u64);
        let _ = std::fs::remove_file(&file);
    }

    #[test]
    fn an_unwritable_path_is_not_reported_as_written() {
        let missing = std::env::temp_dir()
            .join("mentis-no-such-dir")
            .join("r.json");
        assert!(!write_report(Some(&missing), 1));
    }
}
