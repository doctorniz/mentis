//! Folders on iOS. A folder picked in Files can be used only while the app
//! holds access to it, and after a restart only through a bookmark saved when
//! it was picked. The Swift side (`ios/Sources/FoldersPlugin.swift`) shows the
//! picker, keeps the bookmarks, and reopens them; once open, a folder is an
//! ordinary path that the app reads and writes directly.

use serde::{Deserialize, Serialize};
use tauri::Runtime;
use tauri::plugin::{Builder, TauriPlugin};

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_folders);

/// A folder the user picked, open for use.
#[derive(Deserialize, Debug, Clone)]
pub struct Picked {
    /// Its path, with links resolved.
    pub path: String,
    /// The name Files shows for it.
    pub name: String,
}

/// A remembered folder after reopening: where it is now, or `None` if it can
/// no longer be reached (deleted, or its provider is gone).
#[derive(Deserialize, Debug, Clone)]
pub struct Restored {
    pub saved: String,
    pub path: Option<String>,
}

/// The Swift side, once registered.
pub struct Folders<R: Runtime>(#[allow(dead_code)] Handle<R>);

#[cfg(target_os = "ios")]
type Handle<R> = tauri::plugin::PluginHandle<R>;
#[cfg(not(target_os = "ios"))]
type Handle<R> = std::marker::PhantomData<R>;

#[derive(Serialize)]
struct Paths<'a> {
    paths: &'a [String],
}

#[derive(Serialize)]
struct OnePath<'a> {
    path: &'a str,
}

#[derive(Deserialize)]
struct PickResult {
    #[serde(default)]
    picked: Option<Picked>,
}

#[derive(Deserialize)]
struct RestoreResult {
    folders: Vec<Restored>,
}

impl<R: Runtime> Folders<R> {
    /// Show the Files folder picker. `None` when the user cancels.
    pub fn pick(&self) -> Result<Option<Picked>, String> {
        self.call::<PickResult>("pickFolder", ()).map(|r| r.picked)
    }

    /// Reopen the folders saved at these paths.
    pub fn restore(&self, paths: &[String]) -> Result<Vec<Restored>, String> {
        self.call::<RestoreResult>("restore", Paths { paths })
            .map(|r| r.folders)
    }

    /// Stop using a folder and drop its bookmark.
    pub fn forget(&self, path: &str) -> Result<(), String> {
        self.call::<serde_json::Value>("forget", OnePath { path })
            .map(|_| ())
    }

    #[cfg(target_os = "ios")]
    fn call<T: serde::de::DeserializeOwned>(
        &self,
        command: &str,
        payload: impl Serialize,
    ) -> Result<T, String> {
        self.0
            .run_mobile_plugin::<T>(command, payload)
            .map_err(|e| e.to_string())
    }

    #[cfg(not(target_os = "ios"))]
    fn call<T>(&self, _: &str, _: impl Serialize) -> Result<T, String> {
        Err("Picked folders are an iOS feature.".into())
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("folders")
        .setup(|app, api| {
            #[cfg(target_os = "ios")]
            {
                use tauri::Manager;
                let handle = api.register_ios_plugin(init_plugin_folders)?;
                app.manage(Folders(handle));
            }
            let _ = (app, api);
            Ok(())
        })
        .build()
}
