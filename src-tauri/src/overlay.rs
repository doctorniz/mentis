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

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, Runtime, State, WebviewUrl, WebviewWindowBuilder,
    WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

pub const OVERLAY: &str = "capture";
pub const MAIN: &str = "main";
pub const REPORT_ENV: &str = "MENTIS_OVERLAY_REPORT";

const WIDTH: f64 = 640.0;
const INITIAL_HEIGHT: f64 = 64.0;
/// How long after launch the overlay window is created.
const CREATE_AFTER: Duration = Duration::from_millis(1500);

/// The default capture hotkey: Ctrl+Shift+Space, ⌘⇧Space on macOS.
pub fn capture_shortcut() -> Shortcut {
    #[cfg(target_os = "macos")]
    let mods = Modifiers::SUPER | Modifiers::SHIFT;
    #[cfg(not(target_os = "macos"))]
    let mods = Modifiers::CONTROL | Modifiers::SHIFT;
    Shortcut::new(Some(mods), Code::Space)
}

/// Whether the capture hotkey is registered, for the main window to tell the user.
#[derive(Default, serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyStatus {
    /// The hotkey as shown to the user, e.g. `Ctrl+Shift+Space`.
    pub label: String,
    pub registered: bool,
}

pub struct SharedHotkeyStatus(pub Mutex<HotkeyStatus>);

fn shortcut_label() -> String {
    if cfg!(target_os = "macos") {
        "⌘⇧Space"
    } else {
        "Ctrl+Shift+Space"
    }
    .to_string()
}

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

    let shortcut = capture_shortcut();
    app.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |app, pressed, event| {
                if pressed == &shortcut && event.state() == ShortcutState::Pressed {
                    toggle_overlay(app);
                }
            })
            .build(),
    )?;
    let registered = match app.global_shortcut().register(shortcut) {
        Ok(()) => true,
        Err(err) => {
            eprintln!("Capture hotkey unavailable: {err}");
            false
        }
    };
    app.manage(SharedHotkeyStatus(Mutex::new(HotkeyStatus {
        label: shortcut_label(),
        registered,
    })));

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

/// Whether the capture hotkey works, so the app can say when another app holds it.
#[tauri::command]
pub fn capture_hotkey_status(status: State<'_, SharedHotkeyStatus>) -> HotkeyStatus {
    status.0.lock().unwrap_or_else(|e| e.into_inner()).clone()
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
    fn the_default_hotkey_is_ctrl_or_cmd_shift_space() {
        let s = capture_shortcut();
        assert_eq!(s.key, Code::Space);
        assert!(s.mods.contains(Modifiers::SHIFT));
        #[cfg(not(target_os = "macos"))]
        assert!(s.mods.contains(Modifiers::CONTROL));
    }

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
