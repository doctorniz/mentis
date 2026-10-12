package app.mentis

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject

/**
 * Reminders on Android: each is an exact alarm that posts a notification
 * with Snooze and Done. Those buttons work without opening the app: the
 * choice is queued here and written into the item's file the next time the
 * app runs (src/components/reminders/reminder-host.tsx), and a snooze is
 * simply alarmed again. The schedule is kept so it survives a reboot.
 *
 * An item is the JSON the app sends: {id, atMs, title, body, kind, path, at,
 * vault}.
 */
object Reminders {
  private const val CHANNEL = "reminders"
  private const val PREFS = "mentis.reminders"
  private const val KEY_ITEMS = "items"
  private const val KEY_ACTIONS = "actions"
  const val SNOOZE_MINUTES = 10

  const val ACTION_FIRE = "app.mentis.reminder.FIRE"
  const val ACTION_SNOOZE = "app.mentis.reminder.SNOOZE"
  const val ACTION_DONE = "app.mentis.reminder.DONE"
  const val EXTRA_ITEM = "item"

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  /** A stable notification and alarm id for an occurrence. */
  fun notificationId(item: JSONObject) = item.getString("id").hashCode() and 0x7fffffff

  private fun pending(context: Context, action: String, item: JSONObject): PendingIntent {
    val intent = Intent(context, ReminderReceiver::class.java)
      .setAction(action)
      .putExtra(EXTRA_ITEM, item.toString())
    return PendingIntent.getBroadcast(
      context,
      notificationId(item) * 3 + listOf(ACTION_FIRE, ACTION_SNOOZE, ACTION_DONE).indexOf(action),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun alarm(context: Context, item: JSONObject) {
    val at = item.getLong("atMs")
    if (at <= System.currentTimeMillis()) return
    val alarms = context.getSystemService(AlarmManager::class.java)
    val intent = pending(context, ACTION_FIRE, item)
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms()) {
      alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent)
    } else {
      alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent)
    }
  }

  private fun items(context: Context): JSONArray =
    JSONArray(prefs(context).getString(KEY_ITEMS, "[]"))

  /** Replace every scheduled reminder with `itemsJson` (a JSON array). */
  @Synchronized
  fun schedule(context: Context, itemsJson: String) {
    val alarms = context.getSystemService(AlarmManager::class.java)
    val old = items(context)
    for (i in 0 until old.length()) alarms.cancel(pending(context, ACTION_FIRE, old.getJSONObject(i)))
    val next = JSONArray(itemsJson)
    prefs(context).edit().putString(KEY_ITEMS, next.toString()).apply()
    for (i in 0 until next.length()) alarm(context, next.getJSONObject(i))
  }

  /** After a reboot alarms are gone: set them again. */
  fun reschedule(context: Context) {
    val all = items(context)
    for (i in 0 until all.length()) alarm(context, all.getJSONObject(i))
  }

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java)
    if (manager.getNotificationChannel(CHANNEL) != null) return
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL, "Reminders", NotificationManager.IMPORTANCE_HIGH),
    )
  }

  fun show(context: Context, item: JSONObject) {
    ensureChannel(context)
    val open = PendingIntent.getActivity(
      context,
      notificationId(item),
      Intent(context, MainActivity::class.java)
        .setAction(Inbox.ACTION_OPEN_REMINDER)
        .putExtra(EXTRA_ITEM, item.toString())
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val notification = NotificationCompat.Builder(context, CHANNEL)
      .setSmallIcon(android.R.drawable.ic_popup_reminder)
      .setContentTitle(item.optString("title", "Reminder"))
      .setContentText(item.optString("body"))
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setAutoCancel(true)
      .setContentIntent(open)
      .addAction(0, "Snooze $SNOOZE_MINUTES min", pending(context, ACTION_SNOOZE, item))
      .addAction(0, "Done", pending(context, ACTION_DONE, item))
      .build()
    try {
      context.getSystemService(NotificationManager::class.java).notify(notificationId(item), notification)
    } catch (e: SecurityException) {
      // Notifications are not allowed; the app shows missed reminders when opened.
    }
  }

  /** Snooze or Done from the notification: dismiss it, and queue the choice for the app. */
  @Synchronized
  fun act(context: Context, action: String, item: JSONObject) {
    context.getSystemService(NotificationManager::class.java).cancel(notificationId(item))
    val now = System.currentTimeMillis()
    val record = JSONObject()
      .put("item", item)
      .put("whenMs", now)
      .put("action", if (action == ACTION_DONE) "done" else "snooze")
    if (action == ACTION_SNOOZE) {
      val until = now + SNOOZE_MINUTES * 60_000L
      record.put("untilMs", until)
      alarm(context, JSONObject(item.toString()).put("atMs", until))
    }
    val queued = JSONArray(prefs(context).getString(KEY_ACTIONS, "[]")).put(record)
    prefs(context).edit().putString(KEY_ACTIONS, queued.toString()).apply()
  }

  /** The choices made from notifications since the app last looked, taken once. */
  @Synchronized
  fun takeActions(context: Context): String {
    val queued = prefs(context).getString(KEY_ACTIONS, "[]") ?: "[]"
    prefs(context).edit().remove(KEY_ACTIONS).apply()
    return queued
  }
}
