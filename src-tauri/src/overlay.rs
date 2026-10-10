//! The capture overlay: a borderless, always-on-top window shown by a global
//! hotkey, plus the tray icon that keeps the app resident so the hotkey works
//! with the main window closed.
//!
//! The overlay window is created hidden shortly after launch and never
//! destroyed, so the hotkey only has to show it — that is what keeps it under
//! 100 ms. It is created a moment after launch rather than with the main
//! window, so it does not slow the main window's cold start.
//!
//! `MENTIS_OVERLAY_REPORT` names a file for a latency measurement (CI): the
//! app shows the overlay itself once its page is ready and writes the time
//! from that trigger until the page reports a painted frame, then quits. It
//! measures the app's part of the path; the OS's hotkey dispatch is not in it.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, Runtime, State, WebviewUrl, WebviewWindowBuilder,
    WindowEvent,
};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use crate::app_settings::{
    DEFAULT_HOTKEY, SharedAppSettings, hotkey_label, parse_hotkey, settings_file,
};

pub const OVERLAY: &str = "capture";
pub const MAIN: &str = "main";
pub const REPORT_ENV: &str = "MENTIS_OVERLAY_REPORT";
/// Passed when the app is started at login: start in the tray, window hidden.
pub const HIDDEN_ARG: &str = "--hidden";

const WIDTH: f64 = 640.0;
const INITIAL_HEIGHT: f64 = 64.0;
/// How long after launch the overlay window is created.
const CREATE_AFTER: Duration = Duration::from_millis(1500);

/// Whether the capture hotkey is registered, for the main window to tell the user.
#[derive(Default, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyStatus {
    /// The hotkey as stored, e.g. `CmdOrCtrl+Shift+Space`.
    pub hotkey: String,
    /// The hotkey as shown to the user, e.g. `Ctrl+Shift+Space`.
    pub label: String,
    pub registered: bool,
}

pub struct SharedHotkeyStatus(pub Mutex<HotkeyStatus>);

/// A pending latency measurement: where to report, and when the show was triggered.
#[derive(Default)]
pub struct Measurement {
    report: Option<PathBuf>,
    started: Mutex<Option<Instant>>,
}

impl Measurement {
    pub fn from_env() -> Self {
        Self {
            report: std::env::var_os(REPORT_ENV).map(PathBuf::from),
            started: Mutex::new(None),
        }
    }
}

fn write_report(path: &Path, shown_ms: u128) -> bool {
    std::fs::write(path, format!("{{\"shownMs\":{shown_ms}}}")).is_ok()
}

fn create_overlay<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    if app.get_webview_window(OVERLAY).is_some() {
        return Ok(());
    }
    WebviewWindowBuilder::new(app, OVERLAY, WebviewUrl::App("capture.html".into()))
        .title("Mentis capture")
        .inner_size(WIDTH, INITIAL_HEIGHT)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .focused(false)
        .center()
        .build()?;
    Ok(())
}

/// Show the overlay over everything, focused; hide it if it is already showing.
pub fn toggle_overlay<R: Runtime>(app: &AppHandle<R>) {
    if app.get_webview_window(OVERLAY).is_none() && create_overlay(app).is_err() {
        return;
    }
    let Some(window) = app.get_webview_window(OVERLAY) else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
        return;
    }
    let _ = window.center();
    let _ = window.show();
    let _ = window.set_focus();
    let _ = window.emit_to(OVERLAY, "overlay-shown", ());
}

pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn build_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Mentis", true, None::<&str>)?;
    let capture = MenuItem::with_id(app, "capture", "New capture", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Mentis", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &capture, &quit])?;
    let mut tray = TrayIconBuilder::with_id("mentis")
        .tooltip("Mentis")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "capture" => toggle_overlay(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

/// Set up the tray and the hotkey, and create the overlay a moment later.
/// A hotkey another app already holds is reported, not fatal.
pub fn setup<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    build_tray(app)?;

    let settings = SharedAppSettings::load(settings_file(app));
    // A stored hotkey that no longer parses falls back to the default.
    let stored = settings.get().hotkey().to_string();
    let hotkey = if parse_hotkey(&stored).is_ok() {
        stored
    } else {
        DEFAULT_HOTKEY.to_string()
    };
    app.manage(settings);

    // Only the capture hotkey is ever registered, so any press of one is it.
    app.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, _, event| {
                if event.state() == ShortcutState::Pressed {
                    toggle_overlay(app);
                }
            })
            .build(),
    )?;
    let registered = match parse_hotkey(&hotkey).map(|s| app.global_shortcut().register(s)) {
        Ok(Ok(())) => true,
        Ok(Err(err)) => {
            eprintln!("Capture hotkey unavailable: {err}");
            false
        }
        Err(err) => {
            eprintln!("{err}");
            false
        }
    };
    app.manage(SharedHotkeyStatus(Mutex::new(HotkeyStatus {
        label: hotkey_label(&hotkey),
        hotkey,
        registered,
    })));

    // Launched at login: wait in the tray. Otherwise show the window.
    if !std::env::args().any(|a| a == HIDDEN_ARG) {
        show_main(app);
    }

    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(CREATE_AFTER);
        let inner = handle.clone();
        let _ = handle.run_on_main_thread(move || {
            if let Err(err) = create_overlay(&inner) {
                eprintln!("Capture overlay could not be created: {err}");
            }
        });
    });
    Ok(())
}

/// Window behaviour: the main window hides to the tray instead of closing,
/// and the overlay hides when it loses focus (a click outside).
pub fn on_window_event<R: Runtime>(window: &tauri::Window<R>, event: &WindowEvent) {
    match (window.label(), event) {
        (MAIN, WindowEvent::CloseRequested { api, .. }) => {
            api.prevent_close();
            let _ = window.hide();
        }
        (OVERLAY, WindowEvent::Focused(false)) => {
            let _ = window.hide();
        }
        _ => {}
    }
}

#[tauri::command]
pub fn overlay_hide<R: Runtime>(app: AppHandle<R>) {
    if let Some(window) = app.get_webview_window(OVERLAY) {
        let _ = window.hide();
    }
}

/// What the Desktop settings show, and what the app checks at launch.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopSettings {
    hotkey: HotkeyStatus,
    launch_at_login: bool,
    login_prompt_answered: bool,
}

#[tauri::command]
pub fn desktop_settings_get<R: Runtime>(app: AppHandle<R>) -> DesktopSettings {
    let hotkey = app
        .state::<SharedHotkeyStatus>()
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    DesktopSettings {
        hotkey,
        launch_at_login: app.autolaunch().is_enabled().unwrap_or(false),
        login_prompt_answered: app.state::<SharedAppSettings>().get().login_prompt_answered,
    }
}

/// Use `hotkey` (none: the default) for capture. If another app holds it,
/// the previous hotkey stays and the error says so.
#[tauri::command]
pub fn capture_hotkey_set<R: Runtime>(
    app: AppHandle<R>,
    hotkey: Option<String>,
) -> Result<HotkeyStatus, String> {
    let wanted = hotkey.unwrap_or_else(|| DEFAULT_HOTKEY.to_string());
    let next = parse_hotkey(&wanted)?;
    let shortcuts = app.global_shortcut();
    let state = app.state::<SharedHotkeyStatus>();
    let mut status = state.0.lock().unwrap_or_else(|e| e.into_inner());
    let previous = parse_hotkey(&status.hotkey).ok();
    if let Some(previous) = previous.filter(|_| status.registered) {
        let _ = shortcuts.unregister(previous);
    }
    if let Err(err) = shortcuts.register(next) {
        eprintln!("Capture hotkey unavailable: {err}");
        if status.registered {
            status.registered = previous.is_some_and(|p| shortcuts.register(p).is_ok());
        }
        return Err(format!(
            "{} is already used by another app",
            hotkey_label(&wanted)
        ));
    }
    status.label = hotkey_label(&wanted);
    status.registered = true;
    let stored = (wanted != DEFAULT_HOTKEY).then(|| wanted.clone());
    status.hotkey = wanted;
    app.state::<SharedAppSettings>()
        .update(|s| s.capture_hotkey = stored)
        .map_err(|e| format!("The hotkey works but could not be saved: {e}"))?;
    Ok(status.clone())
}

/// Start Mentis at login (hidden, in the tray) or stop doing so. Answers the prompt.
#[tauri::command]
pub fn launch_at_login_set<R: Runtime>(app: AppHandle<R>, enabled: bool) -> Result<bool, String> {
    let autolaunch = app.autolaunch();
    if enabled {
        autolaunch.enable()
    } else {
        autolaunch.disable()
    }
    .map_err(|e| format!("Could not change launch at login: {e}"))?;
    login_prompt_answer(app.clone())?;
    autolaunch.is_enabled().map_err(|e| e.to_string())
}

/// The launch-at-login prompt was answered (or dismissed): do not ask again.
#[tauri::command]
pub fn login_prompt_answer<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    app.state::<SharedAppSettings>()
        .update(|s| s.login_prompt_answered = true)
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// The overlay sizes itself to its content; only the height changes.
#[tauri::command]
pub fn overlay_set_height<R: Runtime>(app: AppHandle<R>, height: f64) {
    if let Some(window) = app.get_webview_window(OVERLAY) {
        let _ = window.set_size(LogicalSize::new(WIDTH, height.clamp(40.0, 720.0)));
    }
}

/// Hand something over to the main window (`>` opens its command palette).
#[tauri::command]
pub fn overlay_open_main<R: Runtime>(app: AppHandle<R>, palette_query: Option<String>) {
    overlay_hide(app.clone());
    show_main(&app);
    if let Some(query) = palette_query {
        let _ = app.emit_to(MAIN, "open-command-palette", query);
    }
}

/// The overlay page has loaded. In a measurement run, trigger the show now.
#[tauri::command]
pub fn overlay_ready<R: Runtime>(app: AppHandle<R>, measurement: State<'_, Measurement>) {
    if measurement.report.is_none() {
        return;
    }
    // Wait off the main thread (sync commands run on it) for the page to
    // settle into the idle state the measurement is about, then trigger.
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(500));
        *app.state::<Measurement>()
            .started
            .lock()
            .unwrap_or_else(|e| e.into_inner()) = Some(Instant::now());
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || toggle_overlay(&handle));
    });
}

/// The overlay painted its first frame after being shown.
#[tauri::command]
pub fn overlay_visible<R: Runtime>(app: AppHandle<R>, measurement: State<'_, Measurement>) {
    let (Some(report), Some(started)) = (
        measurement.report.as_deref(),
        *measurement
            .started
            .lock()
            .unwrap_or_else(|e| e.into_inner()),
    ) else {
        return;
    };
    if write_report(report, started.elapsed().as_millis()) {
        app.exit(0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_report_records_the_latency() {
        let file = std::env::temp_dir().join(format!("mentis-overlay-{}.json", std::process::id()));
        assert!(write_report(&file, 42));
        let json: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&file).unwrap()).unwrap();
        assert_eq!(json["shownMs"], 42);
        let _ = std::fs::remove_file(&file);
    }

    #[test]
    fn no_measurement_without_the_variable() {
        assert!(Measurement::default().report.is_none());
    }
}
