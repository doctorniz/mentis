package app.mentis

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import org.json.JSONObject

/**
 * Reminder alarms and the notification's Snooze and Done. Not exported: only
 * this app's own alarms and notifications can reach it.
 */
class ReminderReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val item = intent.getStringExtra(Reminders.EXTRA_ITEM)?.let(::JSONObject) ?: return
    when (intent.action) {
      Reminders.ACTION_FIRE -> Reminders.show(context, item)
      Reminders.ACTION_SNOOZE, Reminders.ACTION_DONE -> Reminders.act(context, intent.action!!, item)
    }
  }
}

/** A reboot clears alarms: set the kept reminders again. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == Intent.ACTION_BOOT_COMPLETED) Reminders.reschedule(context)
  }
}
