package app.mentis

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

/**
 * What Android asked the app to show, kept until the web app takes it: the
 * activity may be started (or brought back) before the app is ready to act.
 * The app reads entries with `takeInbox` (src/components/shell/launch-inbox.ts):
 *
 * - `{type: "open-reminder", item}`: a reminder notification was tapped.
 * - `{type: "share-text", text, subject?}`: text or a link shared to Mentis.
 * - `{type: "share-files", files: [{path, name, mime}]}`: images shared to
 *   Mentis, copied into the app's cache (`shared/`) while the grant to read
 *   them lasts; the app reads and removes them (`inbox_read_file`).
 * - `{type: "launch", target}`: an app shortcut, the widget or the Quick
 *   Settings tile: "capture", "task" or "journal".
 */
object Inbox {
  const val ACTION_OPEN_REMINDER = "app.mentis.OPEN_REMINDER"
  const val ACTION_CAPTURE = "app.mentis.CAPTURE"
  const val ACTION_NEW_TASK = "app.mentis.NEW_TASK"
  const val ACTION_JOURNAL = "app.mentis.JOURNAL"

  private val entries = mutableListOf<JSONObject>()

  /** The folder shared files are copied into. */
  fun sharedDir(context: Context) = File(context.cacheDir, "shared")

  /** Keep what `intent` asks for, if anything. */
  @Synchronized
  fun accept(context: Context, intent: Intent?) {
    when (intent?.action) {
      ACTION_OPEN_REMINDER -> {
        val item = intent.getStringExtra(Reminders.EXTRA_ITEM) ?: return
        entries.add(JSONObject().put("type", "open-reminder").put("item", JSONObject(item)))
      }
      ACTION_CAPTURE -> launch("capture")
      ACTION_NEW_TASK -> launch("task")
      ACTION_JOURNAL -> launch("journal")
      Intent.ACTION_SEND -> {
        val text = intent.getStringExtra(Intent.EXTRA_TEXT)
        if (intent.type?.startsWith("text/") == true && !text.isNullOrBlank()) {
          entries.add(
            JSONObject()
              .put("type", "share-text")
              .put("text", text)
              .put("subject", intent.getStringExtra(Intent.EXTRA_SUBJECT) ?: ""),
          )
        } else {
          stream(intent)?.let { shareFiles(context, listOf(it)) }
        }
      }
      Intent.ACTION_SEND_MULTIPLE -> shareFiles(context, streams(intent))
    }
  }

  private fun launch(target: String) {
    entries.add(JSONObject().put("type", "launch").put("target", target))
  }

  @Suppress("DEPRECATION")
  private fun stream(intent: Intent): Uri? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
    } else {
      intent.getParcelableExtra(Intent.EXTRA_STREAM)
    }

  @Suppress("DEPRECATION")
  private fun streams(intent: Intent): List<Uri> =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java) ?: emptyList()
    } else {
      intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM) ?: emptyList()
    }

  private fun displayName(context: Context, uri: Uri): String? = try {
    context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
      ?.use { if (it.moveToFirst()) it.getString(0) else null }
  } catch (e: Exception) {
    null
  }

  /** Copy shared files into the cache now: the grant to read them ends with this intent. */
  private fun shareFiles(context: Context, uris: List<Uri>) {
    val dir = sharedDir(context).apply { mkdirs() }
    val files = JSONArray()
    for (uri in uris) {
      val mime = context.contentResolver.getType(uri) ?: "application/octet-stream"
      val name = (displayName(context, uri) ?: "shared")
        .replace(Regex("[\\\\/:*?\"<>|]"), "_")
      val copy = File(dir, "${UUID.randomUUID()}-$name")
      try {
        context.contentResolver.openInputStream(uri)?.use { input ->
          copy.outputStream().use { input.copyTo(it) }
        } ?: continue
      } catch (e: Exception) {
        Log.w("Mentis", "could not copy a shared file", e)
        continue
      }
      files.put(JSONObject().put("path", copy.absolutePath).put("name", name).put("mime", mime))
    }
    if (files.length() > 0) entries.add(JSONObject().put("type", "share-files").put("files", files))
  }

  @Synchronized
  fun take(): String {
    val out = JSONArray(entries)
    entries.clear()
    return out.toString()
  }
}
