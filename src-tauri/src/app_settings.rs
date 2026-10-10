//! Per-machine desktop settings, in `<app data>/app-settings.json`: the
//! capture hotkey and whether the launch-at-login prompt was answered. Not
//! the vault's `config.json`: that syncs between devices, and a hotkey or a
//! login item belongs to one machine. Losing the file only means the defaults.

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_global_shortcut::Shortcut;

const FILE: &str = "app-settings.json";

/// The default capture hotkey: Ctrl+Shift+Space, or Cmd+Shift+Space on macOS.
pub const DEFAULT_HOTKEY: &str = "CmdOrCtrl+Shift+Space";

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    /// A hotkey such as `Ctrl+Alt+KeyM`; none means the default.
    pub capture_hotkey: Option<String>,
    pub login_prompt_answered: bool,
}

impl AppSettings {
    pub fn hotkey(&self) -> &str {
        self.capture_hotkey.as_deref().unwrap_or(DEFAULT_HOTKEY)
    }
}

pub struct SharedAppSettings {
    file: PathBuf,
    settings: Mutex<AppSettings>,
}

impl SharedAppSettings {
    /// Reads the file; a missing or unreadable one gives the defaults.
    pub fn load(file: PathBuf) -> Self {
        let settings = fs::read(&file)
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        Self {
            file,
            settings: Mutex::new(settings),
        }
    }

    pub fn get(&self) -> AppSettings {
        self.settings
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    /// Change the settings and write them out.
    pub fn update(&self, change: impl FnOnce(&mut AppSettings)) -> std::io::Result<AppSettings> {
        let mut settings = self.settings.lock().unwrap_or_else(|e| e.into_inner());
        change(&mut settings);
        if let Some(dir) = self.file.parent() {
            fs::create_dir_all(dir)?;
        }
        fs::write(&self.file, serde_json::to_vec_pretty(&*settings)?)?;
        Ok(settings.clone())
    }
}

pub fn settings_file<R: Runtime>(app: &AppHandle<R>) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(FILE)
}

/// Parse a hotkey string, accepting `Ctrl+Shift+Space`, `ctrl+alt+KeyM`, ….
pub fn parse_hotkey(hotkey: &str) -> Result<Shortcut, String> {
    hotkey
        .parse::<Shortcut>()
        .map_err(|e| format!("{hotkey} is not a hotkey: {e}"))
}

/// How a hotkey is shown: `Ctrl+Shift+Space`, `Cmd+Alt+M` on macOS for CmdOrCtrl.
pub fn hotkey_label(hotkey: &str) -> String {
    hotkey
        .split('+')
        .map(|part| match part.trim().to_ascii_uppercase().as_str() {
            "CMDORCTRL" | "CMDORCONTROL" | "COMMANDORCONTROL" | "COMMANDORCTRL" => {
                if cfg!(target_os = "macos") {
                    "Cmd"
                } else {
                    "Ctrl"
                }
                .to_string()
            }
            "CTRL" | "CONTROL" => "Ctrl".to_string(),
            "ALT" | "OPTION" => "Alt".to_string(),
            "SHIFT" => "Shift".to_string(),
            "SUPER" | "CMD" | "COMMAND" | "META" => if cfg!(target_os = "macos") {
                "Cmd"
            } else {
                "Win"
            }
            .to_string(),
            _ => {
                let key = part.trim();
                key.strip_prefix("Key")
                    .or_else(|| key.strip_prefix("Digit"))
                    .unwrap_or(key)
                    .to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("+")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn temp_file(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("mentis-{name}-{}.json", std::process::id()))
    }

    #[test]
    fn missing_or_broken_files_give_the_defaults() {
        let missing = SharedAppSettings::load(temp_file("absent"));
        assert_eq!(missing.get(), AppSettings::default());
        assert_eq!(missing.get().hotkey(), DEFAULT_HOTKEY);

        let broken = temp_file("broken");
        fs::write(&broken, b"{ not json").unwrap();
        assert_eq!(
            SharedAppSettings::load(broken.clone()).get(),
            AppSettings::default()
        );
        let _ = fs::remove_file(broken);
    }

    #[test]
    fn updates_are_written_and_read_back() {
        let file = temp_file("roundtrip");
        let shared = SharedAppSettings::load(file.clone());
        shared
            .update(|s| {
                s.capture_hotkey = Some("Ctrl+Alt+KeyM".into());
                s.login_prompt_answered = true;
            })
            .unwrap();
        let again = SharedAppSettings::load(file.clone()).get();
        assert_eq!(again.hotkey(), "Ctrl+Alt+KeyM");
        assert!(again.login_prompt_answered);
        let _ = fs::remove_file(file);
    }

    #[test]
    fn hotkeys_parse_from_the_forms_the_app_writes() {
        assert!(parse_hotkey(DEFAULT_HOTKEY).is_ok());
        assert!(parse_hotkey("Ctrl+Alt+KeyM").is_ok());
        assert!(parse_hotkey("ctrl+shift+Digit1").is_ok());
        assert!(parse_hotkey("Ctrl+Nonsense").is_err());
    }

    #[test]
    fn labels_read_like_the_keys() {
        assert_eq!(hotkey_label("Ctrl+Alt+KeyM"), "Ctrl+Alt+M");
        assert_eq!(hotkey_label("ctrl+shift+Digit1"), "Ctrl+Shift+1");
        #[cfg(not(target_os = "macos"))]
        assert_eq!(hotkey_label(DEFAULT_HOTKEY), "Ctrl+Shift+Space");
    }

    #[test]
    fn a_path_without_a_parent_still_loads() {
        let shared = SharedAppSettings::load(Path::new(FILE).to_path_buf());
        assert_eq!(shared.get().hotkey(), DEFAULT_HOTKEY);
    }
}
