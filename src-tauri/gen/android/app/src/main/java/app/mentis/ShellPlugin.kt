package app.mentis

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

/**
 * The app's own hooks into the Android activity. `fullyDrawn` tells Android
 * the app shell is on screen, which logs "Fully drawn … +Nms" from process
 * start: the phone's cold-start time (src-tauri/src/startup.rs).
 * `moveTaskToBack` sends the app to the background (the back button).
 */
@TauriPlugin
class ShellPlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun fullyDrawn(invoke: Invoke) {
    activity.runOnUiThread { activity.reportFullyDrawn() }
    invoke.resolve()
  }

  /** Back with nothing left to go back to: leave the app running, as Android apps do. */
  @Command
  fun moveTaskToBack(invoke: Invoke) {
    activity.runOnUiThread { activity.moveTaskToBack(true) }
    invoke.resolve()
  }
}
