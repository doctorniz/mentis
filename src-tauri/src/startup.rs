//! Cold-start measurement for CI. When `MENTIS_STARTUP_REPORT` names a file, the
//! window's "shell is up" signal writes the wall-clock time there and quits;
//! the launcher compares it with the time it spawned the process. Without the
//! variable the signal does nothing.
//!
//! A measured launch may also name the vault to open in `MENTIS_STARTUP_VAULT`,
//! for a fresh profile with no remembered vault. It is ignored unless a report
//! was asked for, and the folder must still be in the recent list to open.

use std::ffi::OsString;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Runtime};

pub const REPORT_ENV: &str = "MENTIS_STARTUP_REPORT";
pub const VAULT_ENV: &str = "MENTIS_STARTUP_VAULT";

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

/// The vault a measured launch asked for. Nothing unless a report was asked for too.
fn measured_vault(report: Option<OsString>, vault: Option<OsString>) -> Option<String> {
    report?;
    vault?.into_string().ok().filter(|v| !v.is_empty())
}

#[tauri::command]
pub fn startup_vault() -> Option<String> {
    measured_vault(std::env::var_os(REPORT_ENV), std::env::var_os(VAULT_ENV))
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

    #[test]
    fn a_vault_is_only_named_for_a_measured_launch() {
        assert_eq!(measured_vault(None, Some("C:/V".into())), None);
        assert_eq!(
            measured_vault(Some("r.json".into()), Some("C:/V".into())),
            Some("C:/V".to_string())
        );
    }

    #[test]
    fn a_measured_launch_without_a_vault_names_none() {
        assert_eq!(measured_vault(Some("r.json".into()), None), None);
        assert_eq!(measured_vault(Some("r.json".into()), Some("".into())), None);
    }
}
