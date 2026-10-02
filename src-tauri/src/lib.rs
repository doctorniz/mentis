#[doc(hidden)]
pub mod index;
#[doc(hidden)]
pub mod oauth;
#[doc(hidden)]
pub mod startup;
#[doc(hidden)]
pub mod vault_fs;
#[doc(hidden)]
pub mod vaults;
#[doc(hidden)]
pub mod watch;

use tauri::Manager;

/// The vault commands and the state they share. Public for the IPC tests.
#[doc(hidden)]
pub fn with_vault_commands<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder
        .manage(vault_fs::VaultRoots::default())
        .manage(watch::VaultWatcher::default())
        .manage(oauth::OAuthAttempt::default())
        .manage(index::SharedHost::new(std::sync::Mutex::new(
            index::IndexHost::unplaced(),
        )))
        .setup(|app| {
            let recents = vaults::Recents::load(vaults::recents_file(app.handle()));
            vaults::grant_recent(&app.state::<vault_fs::VaultRoots>(), &recents);
            app.manage(recents);
            let dir = index::index_dir(app.handle());
            app.state::<index::SharedHost>()
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .place(dir);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            vault_fs::vault_read,
            vault_fs::vault_write,
            vault_fs::vault_exists,
            vault_fs::vault_stat,
            vault_fs::vault_mkdir,
            vault_fs::vault_read_dir,
            vault_fs::vault_rename,
            vault_fs::vault_copy,
            vault_fs::vault_remove,
            vault_fs::vault_remove_dir,
            vaults::vault_recent,
            vaults::vault_pick_folder,
            vaults::vault_create,
            vaults::vault_open_recent,
            vaults::vault_forget,
            index::index_call,
            watch::vault_watch_start,
            watch::vault_watch_stop,
            oauth::oauth_authorize,
            startup::startup_ready,
        ])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    with_vault_commands(tauri::Builder::default().plugin(tauri_plugin_dialog::init()))
        .run(tauri::generate_context!())
        .expect("error while running Mentis");
}
