#[doc(hidden)]
pub mod vault_fs;

/// The vault file commands and the state they share. Public for the IPC tests.
#[doc(hidden)]
pub fn with_vault_commands<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder
        .manage(vault_fs::VaultRoots::default())
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
        ])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    with_vault_commands(tauri::Builder::default())
        .run(tauri::generate_context!())
        .expect("error while running Mentis");
}
