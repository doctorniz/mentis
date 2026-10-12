package app.mentis

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class ScheduleArgs {
  /** A JSON array of reminders (see Reminders). */
  lateinit var items: String
}

/**
 * The app's own hooks into the Android activity. `fullyDrawn` tells Android
 * the app shell is on screen, which logs "Fully drawn … +Nms" from process
 * start: the phone's cold-start time (src-tauri/src/startup.rs).
 * `moveTaskToBack` sends the app to the background (the back button).
 * `scheduleReminders` / `takeReminderActions` drive Reminders; `takeInbox`
 * hands over what Android asked the app to show.
 */
@TauriPlugin
class ShellPlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun fullyDrawn(invoke: Invoke) {
    activity.runOnUiThread { activity.reportFullyDrawn() }
    invoke.resolve()
  }

  @Command
  fun scheduleReminders(invoke: Invoke) {
    val args = invoke.parseArgs(ScheduleArgs::class.java)
    Reminders.schedule(activity, args.items)
    invoke.resolve()
  }

  /** `{actions}`: a JSON array of Snooze / Done choices made from notifications. */
  @Command
  fun takeReminderActions(invoke: Invoke) {
    invoke.resolve(JSObject().put("actions", Reminders.takeActions(activity)))
  }

  /** `{entries}`: a JSON array of what Android asked the app to show. */
  @Command
  fun takeInbox(invoke: Invoke) {
    invoke.resolve(JSObject().put("entries", Inbox.take()))
  }

  /** Back with nothing left to go back to: leave the app running, as Android apps do. */
  @Command
  fun moveTaskToBack(invoke: Invoke) {
    activity.runOnUiThread { activity.moveTaskToBack(true) }
    invoke.resolve()
  }
}
