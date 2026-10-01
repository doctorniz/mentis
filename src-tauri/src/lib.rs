#[doc(hidden)]
pub mod vault_fs;
#[doc(hidden)]
pub mod vaults;

use tauri::Manager;

/// The vault commands and the state they share. Public for the IPC tests.
#[doc(hidden)]
pub fn with_vault_commands<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder
        .manage(vault_fs::VaultRoots::default())
        .setup(|app| {
            let recents = vaults::Recents::load(vaults::recents_file(app.handle()));
            vaults::grant_recent(&app.state::<vault_fs::VaultRoots>(), &recents);
            app.manage(recents);
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
        ])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    with_vault_commands(tauri::Builder::default().plugin(tauri_plugin_dialog::init()))
        .run(tauri::generate_context!())
        .expect("error while running Mentis");
}
