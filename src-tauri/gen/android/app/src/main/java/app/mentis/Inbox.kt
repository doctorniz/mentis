package app.mentis

import android.content.Intent
import org.json.JSONArray
import org.json.JSONObject

/**
 * What Android asked the app to show, kept until the web app takes it: the
 * activity may be started (or brought back) before the app is ready to act.
 * Each entry is `{type, …}`; the app reads them with `takeInbox`
 * (src/components/shell/launch-inbox.ts).
 */
object Inbox {
  const val ACTION_OPEN_REMINDER = "app.mentis.OPEN_REMINDER"

  private val entries = mutableListOf<JSONObject>()

  /** Keep what `intent` asks for, if anything. */
  @Synchronized
  fun accept(intent: Intent?) {
    when (intent?.action) {
      ACTION_OPEN_REMINDER -> {
        val item = intent.getStringExtra(Reminders.EXTRA_ITEM) ?: return
        entries.add(JSONObject().put("type", "open-reminder").put("item", JSONObject(item)))
      }
    }
  }

  @Synchronized
  fun take(): String {
    val out = JSONArray(entries)
    entries.clear()
    return out.toString()
  }
}
