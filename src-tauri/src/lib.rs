#[doc(hidden)]
pub mod app_settings;
#[doc(hidden)]
pub mod index;
#[doc(hidden)]
pub mod oauth;
#[doc(hidden)]
pub mod overlay;
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
            setup_vault_state(app.handle());
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
            startup::startup_vault,
            overlay::desktop_settings_get,
            overlay::capture_hotkey_set,
            overlay::launch_at_login_set,
            overlay::login_prompt_answer,
            overlay::overlay_hide,
            overlay::overlay_set_height,
            overlay::overlay_open_main,
            overlay::overlay_ready,
            overlay::overlay_visible,
        ])
}

/// Load the recent vaults (granting their folders) and place the index.
fn setup_vault_state<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let recents = vaults::Recents::load(vaults::recents_file(app));
    vaults::grant_recent(&app.state::<vault_fs::VaultRoots>(), &recents);
    app.manage(recents);
    let dir = index::index_dir(app);
    app.state::<index::SharedHost>()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .place(dir);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Single instance first: a second launch shows the running app instead of
    // starting another process that would fight it for the capture hotkey.
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            overlay::show_main(app)
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![overlay::HIDDEN_ARG]),
        ))
        .manage(overlay::Measurement::from_env())
        .on_window_event(overlay::on_window_event);
    // A builder keeps one setup closure, the last given, so this one does both.
    with_vault_commands(builder)
        .setup(|app| {
            setup_vault_state(app.handle());
            overlay::setup(app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Mentis");
}
