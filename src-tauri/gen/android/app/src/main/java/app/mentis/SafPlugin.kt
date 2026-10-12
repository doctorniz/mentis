package app.mentis

import android.app.Activity
import android.content.Intent
import android.net.Uri
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.util.concurrent.Executors

/**
 * Picking a folder for a vault through the Storage Access Framework: these
 * need the activity, so they go through the plugin. Everything done with the
 * files afterwards is in SafStore, called directly from Rust.
 */

@InvokeArg
class NameArgs {
  lateinit var name: String
}

@TauriPlugin
class SafPlugin(private val activity: Activity) : Plugin(activity) {
  private val io = Executors.newSingleThreadExecutor()

  /** The name a vault gets when created inside a picked parent. */
  private var pendingName: String? = null

  init {
    SafStore.init(activity)
  }

  override fun onResume() {
    SafStore.forgetAll()
  }

  private fun folderIntent() = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).addFlags(
    Intent.FLAG_GRANT_READ_URI_PERMISSION or
      Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
      Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION,
  )

  /** Keep access to the picked tree across launches; null if cancelled. */
  private fun granted(result: ActivityResult): Uri? {
    val uri = result.data?.data
    if (result.resultCode != Activity.RESULT_OK || uri == null) return null
    activity.contentResolver.takePersistableUriPermission(
      uri,
      Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
    )
    return uri
  }

  private fun picked(root: String, name: String) = JSObject().apply {
    put("picked", JSObject().apply {
      put("root", root)
      put("name", name)
    })
  }

  /** Off the UI thread: provider queries can be slow. */
  private fun work(invoke: Invoke, block: () -> JSObject) {
    io.execute {
      try {
        invoke.resolve(block())
      } catch (e: Exception) {
        invoke.reject(e.message ?: e.toString())
      }
    }
  }

  @Command
  fun pickFolder(invoke: Invoke) {
    startActivityForResult(invoke, folderIntent(), "folderPicked")
  }

  @ActivityCallback
  private fun folderPicked(invoke: Invoke, result: ActivityResult) {
    val tree = granted(result) ?: return invoke.resolve(JSObject())
    work(invoke) {
      picked(tree.toString(), SafStore.displayName(tree, SafStore.rootId(tree)) ?: "Vault")
    }
  }

  @Command
  fun createFolder(invoke: Invoke) {
    pendingName = invoke.parseArgs(NameArgs::class.java).name
    startActivityForResult(invoke, folderIntent(), "parentPicked")
  }

  @ActivityCallback
  private fun parentPicked(invoke: Invoke, result: ActivityResult) {
    val name = pendingName ?: return invoke.reject("no folder name")
    pendingName = null
    val tree = granted(result) ?: return invoke.resolve(JSObject())
    work(invoke) {
      if (SafStore.find(tree, name) != null) {
        throw IllegalStateException(
          "A folder named \"$name\" already exists there. Open it instead, or choose another name.",
        )
      }
      SafStore.mkdirs(tree, name)
      picked("$tree|$name", name)
    }
  }
}
