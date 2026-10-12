//! Reminder delivery. On the desktop: the window works out what is due and hands
//! the next ones over; a thread here sleeps until each and shows the system
//! notification. On a phone the app is stopped in the background, so each
//! reminder is handed to the system to show at its time instead (`mobile`).
//!
//! Desktop detail. The window works out what is due and hands
//! the next ones over; a thread here sleeps until each and shows the system
//! notification. It runs in this process because a hidden window's timers are
//! throttled, and the app usually sits hidden in the tray.

#[cfg(desktop)]
use std::collections::HashSet;
#[cfg(desktop)]
use std::sync::{Arc, Condvar, Mutex};
#[cfg(desktop)]
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
#[cfg(desktop)]
use tauri::{AppHandle, Emitter, Manager, Runtime};
#[cfg(desktop)]
use tauri_plugin_notification::NotificationExt;

/// One reminder to deliver.
#[derive(Deserialize, Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Due {
    /// Stable for an occurrence: the window uses it to tell them apart.
    pub id: String,
    /// When, in epoch milliseconds.
    pub at_ms: i64,
    pub title: String,
    pub body: String,
    /// The occurrence, so a phone can settle it from its notification.
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub at: String,
}

#[cfg(desktop)]
#[derive(Default)]
struct Queue {
    pending: Vec<Due>,
    fired: HashSet<String>,
}

#[cfg(desktop)]
/// The reminders still to deliver, and a bell that wakes the thread when they change.
#[derive(Default, Clone)]
pub struct Schedule(Arc<(Mutex<Queue>, Condvar)>);

#[cfg(desktop)]
fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as i64)
}

#[cfg(desktop)]
/// The longest the thread sleeps at once, so a clock change or a resume from
/// sleep is noticed within this.
const MAX_SLEEP: Duration = Duration::from_secs(30);

#[cfg(desktop)]
impl Schedule {
    /// Replace what is pending. Ones already delivered are not delivered again.
    pub fn replace(&self, items: Vec<Due>) {
        let (lock, bell) = &*self.0;
        let mut q = lock.lock().unwrap_or_else(|e| e.into_inner());
        let ids: HashSet<&str> = items.iter().map(|d| d.id.as_str()).collect();
        q.fired.retain(|id| ids.contains(id.as_str()));
        q.pending = items
            .into_iter()
            .filter(|d| !q.fired.contains(&d.id))
            .collect();
        bell.notify_all();
    }

    /// Take what is due at `now`, and say how long until the next one.
    fn take_due(q: &mut Queue, now: i64) -> (Vec<Due>, Duration) {
        let (due, later): (Vec<Due>, Vec<Due>) = std::mem::take(&mut q.pending)
            .into_iter()
            .partition(|d| d.at_ms <= now);
        q.pending = later;
        for d in &due {
            q.fired.insert(d.id.clone());
        }
        let wait = q
            .pending
            .iter()
            .map(|d| Duration::from_millis((d.at_ms - now).max(0) as u64))
            .min()
            .map_or(MAX_SLEEP, |w| w.min(MAX_SLEEP));
        (due, wait)
    }

    /// Deliver each reminder when it falls due, for as long as the app runs.
    pub fn run<R: Runtime>(self, app: AppHandle<R>) {
        std::thread::spawn(move || {
            let (lock, bell) = &*self.0;
            let mut q = lock.lock().unwrap_or_else(|e| e.into_inner());
            loop {
                let (due, wait) = Self::take_due(&mut q, now_ms());
                if !due.is_empty() {
                    drop(q);
                    for d in &due {
                        deliver(&app, d);
                    }
                    q = lock.lock().unwrap_or_else(|e| e.into_inner());
                    continue;
                }
                q = bell
                    .wait_timeout(q, wait)
                    .unwrap_or_else(|e| e.into_inner())
                    .0;
            }
        });
    }
}

#[cfg(desktop)]
fn deliver<R: Runtime>(app: &AppHandle<R>, due: &Due) {
    let _ = app
        .notification()
        .builder()
        .title(&due.title)
        .body(&due.body)
        .show();
    // The window shows its own card with Snooze and Done, whether or not
    // the system notification appeared.
    let _ = app.emit("reminder-fired", &due.id);
}

#[cfg(desktop)]
/// Replace the reminders the shell will deliver.
#[tauri::command]
pub fn reminders_schedule(items: Vec<Due>, schedule: tauri::State<'_, Schedule>) {
    schedule.replace(items);
}

#[cfg(desktop)]
/// Start the delivery thread.
pub fn setup<R: Runtime>(app: &AppHandle<R>) {
    let schedule = Schedule::default();
    app.manage(schedule.clone());
    schedule.run(app.clone());
}

#[cfg(desktop)]
#[cfg(test)]
mod tests {
    use super::*;

    fn due(id: &str, at_ms: i64) -> Due {
        Due {
            id: id.into(),
            at_ms,
            title: "T".into(),
            body: String::new(),
            kind: String::new(),
            path: String::new(),
            at: String::new(),
        }
    }

    #[test]
    fn takes_what_is_due_and_waits_for_the_next() {
        let s = Schedule::default();
        s.replace(vec![due("a", 100), due("b", 5_100), due("c", 50)]);
        let mut q = s.0.0.lock().unwrap();
        let (fired, wait) = Schedule::take_due(&mut q, 100);
        assert_eq!(
            fired.iter().map(|d| d.id.as_str()).collect::<Vec<_>>(),
            ["a", "c"]
        );
        assert_eq!(wait, Duration::from_secs(5));
        let (fired, wait) = Schedule::take_due(&mut q, 200);
        assert!(fired.is_empty());
        assert_eq!(wait, Duration::from_millis(4_900));
    }

    #[test]
    fn a_new_schedule_does_not_deliver_one_twice() {
        let s = Schedule::default();
        s.replace(vec![due("a", 100)]);
        Schedule::take_due(&mut s.0.0.lock().unwrap(), 100);
        s.replace(vec![due("a", 100), due("b", 200)]);
        let (fired, _) = Schedule::take_due(&mut s.0.0.lock().unwrap(), 300);
        assert_eq!(fired, vec![due("b", 200)]);
    }

    #[test]
    fn sleeps_at_most_thirty_seconds() {
        let s = Schedule::default();
        s.replace(vec![due("a", 10_000_000)]);
        let (_, wait) = Schedule::take_due(&mut s.0.0.lock().unwrap(), 0);
        assert_eq!(wait, MAX_SLEEP);
    }
}

#[cfg(mobile)]
pub use mobile::setup;

#[cfg(mobile)]
pub mod mobile {
    //! On a phone the app is stopped in the background, so reminders are handed
    //! to Android (`Reminders.kt`): exact alarms, and notifications whose Snooze
    //! and Done work without opening the app. Those choices wait in Kotlin until
    //! the app takes them (`reminders_take_actions`) and writes them to files.

    use serde_json::{Value, json};
    use tauri::{AppHandle, Runtime};
    use tauri_plugin_notification::{NotificationExt, PermissionState};

    use super::Due;
    use crate::startup::shell_call;

    /// Replace the reminders Android will show. Asks for permission to notify
    /// the first time there is something to show.
    #[tauri::command]
    pub async fn reminders_schedule<R: Runtime>(
        app: AppHandle<R>,
        items: Vec<Due>,
        vault: Option<String>,
    ) -> Result<(), String> {
        if !items.is_empty() {
            let notifications = app.notification();
            if matches!(
                notifications.permission_state(),
                Ok(PermissionState::Prompt | PermissionState::PromptWithRationale)
            ) {
                let _ = notifications.request_permission();
            }
        }
        let items: Vec<Value> = items
            .into_iter()
            .map(|d| {
                let mut v = serde_json::to_value(d).unwrap_or_default();
                v["vault"] = json!(vault);
                v
            })
            .collect();
        let payload = json!({ "items": serde_json::to_string(&items).map_err(|e| e.to_string())? });
        shell_call::<_, Value>(&app, "scheduleReminders", payload).map(|_| ())
    }

    /// Snooze and Done chosen from notifications since the app last asked, each
    /// `{item, action, whenMs, untilMs?}`.
    #[tauri::command]
    pub async fn reminders_take_actions<R: Runtime>(app: AppHandle<R>) -> Result<Value, String> {
        let taken: Value = shell_call(&app, "takeReminderActions", json!({}))?;
        let raw = taken["actions"].as_str().unwrap_or("[]");
        serde_json::from_str(raw).map_err(|e| e.to_string())
    }

    pub fn setup<R: Runtime>(_: &AppHandle<R>) {}
}
