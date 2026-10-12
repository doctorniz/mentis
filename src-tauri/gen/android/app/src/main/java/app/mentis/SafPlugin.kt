package app.mentis

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.DocumentsContract.Document
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.FileNotFoundException
import java.util.Collections
import java.util.concurrent.Executors

/**
 * Vaults in a folder the user picked through the Storage Access Framework.
 * The Rust side (src-tauri/src/saf.rs) calls these commands; a vault path is
 * resolved to a document inside the picked tree. Reads and writes hand back a
 * file descriptor rather than the bytes.
 *
 * Nothing runs on the UI thread. Changes run on one background thread, in
 * the order made; reads run on a small pool beside it, since the indexer keeps
 * several in flight and each waits mostly on the document provider.
 */

@InvokeArg
class TreePathArgs {
  lateinit var tree: String
  var path: String = ""
}

@InvokeArg
class OpenFdArgs {
  lateinit var tree: String
  var path: String = ""
  var write: Boolean = false
}

@InvokeArg
class RenameArgs {
  lateinit var tree: String
  lateinit var from: String
  lateinit var to: String
}

@InvokeArg
class TreeArgs {
  lateinit var tree: String
}

@InvokeArg
class NameArgs {
  lateinit var name: String
}

private const val EXTERNAL_STORAGE = "com.android.externalstorage.documents"
private const val BINARY = "application/octet-stream"

@TauriPlugin
class SafPlugin(private val activity: Activity) : Plugin(activity) {
  private val io = Executors.newSingleThreadExecutor()
  private val reads = Executors.newFixedThreadPool(8)
  private val resolver get() = activity.contentResolver

  /** Document ids by "tree\u0000path", for providers whose ids are opaque. */
  private val ids: MutableMap<String, String> = Collections.synchronizedMap(
    object : LinkedHashMap<String, String>(256, 0.75f, true) {
      override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, String>?) = size > 4096
    },
  )

  /** The name a vault gets when created inside a picked parent. */
  private var pendingName: String? = null

  override fun onResume() {
    // Files may have changed in another app while this one was away.
    io.execute { ids.clear() }
  }

  private fun work(invoke: Invoke, readOnly: Boolean = false, block: () -> JSObject?) {
    (if (readOnly) reads else io).execute {
      try {
        val result = block()
        if (result == null) invoke.resolve() else invoke.resolve(result)
      } catch (e: Exception) {
        invoke.reject(e.message ?: e.toString())
      }
    }
  }

  // ── Resolving paths ────────────────────────────────────────────────────────

  private fun docUri(tree: Uri, id: String) = DocumentsContract.buildDocumentUriUsingTree(tree, id)

  private fun rootId(tree: Uri) = DocumentsContract.getTreeDocumentId(tree)

  private fun key(tree: Uri, path: String) = "$tree\u0000$path"

  private fun exists(tree: Uri, id: String): Boolean = try {
    resolver.query(docUri(tree, id), arrayOf(Document.COLUMN_DOCUMENT_ID), null, null, null)
      ?.use { it.moveToFirst() } ?: false
  } catch (e: Exception) {
    false
  }

  private fun childId(tree: Uri, parentId: String, name: String): String? {
    val children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, parentId)
    resolver.query(
      children,
      arrayOf(Document.COLUMN_DOCUMENT_ID, Document.COLUMN_DISPLAY_NAME),
      null, null, null,
    )?.use { c ->
      while (c.moveToNext()) if (c.getString(1) == name) return c.getString(0)
    }
    return null
  }

  /**
   * The document id of `path` in `tree`, or null if there is nothing there.
   * With `verify` false, phone storage ids are built without asking the
   * provider, for callers whose next call fails anyway if it is missing.
   */
  private fun find(tree: Uri, path: String, verify: Boolean = true): String? {
    val root = rootId(tree)
    if (path.isEmpty()) return root
    // Phone storage ids are paths, so they can be built rather than looked up.
    if (tree.authority == EXTERNAL_STORAGE) {
      val id = if (root.endsWith(":")) root + path else "$root/$path"
      return if (!verify || exists(tree, id)) id else null
    }
    ids[key(tree, path)]?.let { if (exists(tree, it)) return it }
    var id = root
    var sofar = ""
    for (seg in path.split('/')) {
      sofar = if (sofar.isEmpty()) seg else "$sofar/$seg"
      id = ids[key(tree, sofar)]?.takeIf { exists(tree, it) }
        ?: childId(tree, id, seg)?.also { ids[key(tree, sofar)] = it }
        ?: return null
    }
    return id
  }

  private fun forget(tree: Uri, path: String) {
    val prefix = key(tree, path)
    synchronized(ids) { ids.keys.removeAll { it == prefix || it.startsWith("$prefix/") } }
  }

  private fun parentOf(path: String) = path.substringBeforeLast('/', "")

  private fun nameOf(path: String) = path.substringAfterLast('/')

  /** Create every missing folder of `path`; the folder's id. */
  private fun mkdirs(tree: Uri, path: String): String {
    var id = rootId(tree)
    var sofar = ""
    if (path.isEmpty()) return id
    for (seg in path.split('/')) {
      sofar = if (sofar.isEmpty()) seg else "$sofar/$seg"
      id = find(tree, sofar) ?: run {
        val made = DocumentsContract.createDocument(resolver, docUri(tree, id), Document.MIME_TYPE_DIR, seg)
          ?: throw FileNotFoundException("could not create folder: $sofar")
        DocumentsContract.getDocumentId(made).also { ids[key(tree, sofar)] = it }
      }
    }
    return id
  }

  private fun statOf(tree: Uri, id: String): JSObject? = try {
    statQuery(tree, id)
  } catch (e: FileNotFoundException) {
    null
  }

  private fun statQuery(tree: Uri, id: String): JSObject? {
    resolver.query(
      docUri(tree, id),
      arrayOf(Document.COLUMN_MIME_TYPE, Document.COLUMN_SIZE, Document.COLUMN_LAST_MODIFIED),
      null, null, null,
    )?.use { c ->
      if (!c.moveToFirst()) return null
      return JSObject().apply {
        put("isDirectory", c.getString(0) == Document.MIME_TYPE_DIR)
        put("size", if (c.isNull(1)) 0 else c.getLong(1))
        val mtime = if (c.isNull(2)) 0L else c.getLong(2)
        if (mtime > 0) put("mtime", mtime.toDouble())
      }
    }
    return null
  }

  private fun displayName(tree: Uri, id: String): String? = try {
    resolver.query(docUri(tree, id), arrayOf(Document.COLUMN_DISPLAY_NAME), null, null, null)
      ?.use { if (it.moveToFirst()) it.getString(0) else null }
  } catch (e: Exception) {
    null
  }

  // ── Commands ───────────────────────────────────────────────────────────────

  @Command
  fun stat(invoke: Invoke) {
    val args = invoke.parseArgs(TreePathArgs::class.java)
    work(invoke, readOnly = true) {
      val tree = Uri.parse(args.tree)
      val stat = find(tree, args.path, verify = false)?.let { statOf(tree, it) }
      JSObject().apply { if (stat != null) put("stat", stat) }
    }
  }

  @Command
  fun list(invoke: Invoke) {
    val args = invoke.parseArgs(TreePathArgs::class.java)
    work(invoke, readOnly = true) {
      val tree = Uri.parse(args.tree)
      val id = find(tree, args.path) ?: throw FileNotFoundException("not found: ${args.path}")
      val entries = JSArray()
      resolver.query(
        DocumentsContract.buildChildDocumentsUriUsingTree(tree, id),
        arrayOf(
          Document.COLUMN_DOCUMENT_ID,
          Document.COLUMN_DISPLAY_NAME,
          Document.COLUMN_MIME_TYPE,
          Document.COLUMN_SIZE,
          Document.COLUMN_LAST_MODIFIED,
        ),
        null, null, null,
      )?.use { c ->
        while (c.moveToNext()) {
          val name = c.getString(1) ?: continue
          val child = if (args.path.isEmpty()) name else "${args.path}/$name"
          if (tree.authority != EXTERNAL_STORAGE) ids[key(tree, child)] = c.getString(0)
          entries.put(JSObject().apply {
            put("name", name)
            put("isDirectory", c.getString(2) == Document.MIME_TYPE_DIR)
            put("size", if (c.isNull(3)) 0 else c.getLong(3))
            val mtime = if (c.isNull(4)) 0L else c.getLong(4)
            if (mtime > 0) put("mtime", mtime.toDouble())
          })
        }
      }
      JSObject().apply { put("entries", entries) }
    }
  }

  @Command
  fun mkdirs(invoke: Invoke) {
    val args = invoke.parseArgs(TreePathArgs::class.java)
    work(invoke) {
      mkdirs(Uri.parse(args.tree), args.path)
      null
    }
  }

  @Command
  fun openFd(invoke: Invoke) {
    val args = invoke.parseArgs(OpenFdArgs::class.java)
    // Opening for reading changes nothing, and fails by itself if missing.
    work(invoke, readOnly = !args.write) {
      val tree = Uri.parse(args.tree)
      val id = find(tree, args.path, verify = args.write) ?: if (args.write) {
        val parent = mkdirs(tree, parentOf(args.path))
        val made = DocumentsContract.createDocument(resolver, docUri(tree, parent), BINARY, nameOf(args.path))
          ?: throw FileNotFoundException("could not create: ${args.path}")
        DocumentsContract.getDocumentId(made).also { ids[key(tree, args.path)] = it }
      } else {
        throw FileNotFoundException("not found: ${args.path}")
      }
      val pfd = resolver.openFileDescriptor(docUri(tree, id), if (args.write) "wt" else "r")
        ?: throw FileNotFoundException("could not open: ${args.path}")
      JSObject().apply { put("fd", pfd.detachFd()) }
    }
  }

  @Command
  fun rename(invoke: Invoke) {
    val args = invoke.parseArgs(RenameArgs::class.java)
    work(invoke) {
      val tree = Uri.parse(args.tree)
      val id = find(tree, args.from) ?: throw FileNotFoundException("not found: ${args.from}")
      // As on disk, a file already at the destination is replaced.
      find(tree, args.to)?.let { existing ->
        if (existing != id) DocumentsContract.deleteDocument(resolver, docUri(tree, existing))
      }
      var uri = docUri(tree, id)
      val fromParent = parentOf(args.from)
      val toParent = parentOf(args.to)
      if (fromParent != toParent) {
        val source = find(tree, fromParent) ?: rootId(tree)
        val target = mkdirs(tree, toParent)
        uri = DocumentsContract.moveDocument(resolver, uri, docUri(tree, source), docUri(tree, target))
          ?: throw FileNotFoundException("could not move: ${args.from}")
      }
      if (nameOf(args.from) != nameOf(args.to)) {
        DocumentsContract.renameDocument(resolver, uri, nameOf(args.to))
          ?: throw FileNotFoundException("could not rename: ${args.from}")
      }
      forget(tree, args.from)
      forget(tree, args.to)
      null
    }
  }

  @Command
  fun delete(invoke: Invoke) {
    val args = invoke.parseArgs(TreePathArgs::class.java)
    work(invoke) {
      val tree = Uri.parse(args.tree)
      val id = find(tree, args.path) ?: throw FileNotFoundException("not found: ${args.path}")
      if (!DocumentsContract.deleteDocument(resolver, docUri(tree, id))) {
        throw FileNotFoundException("could not delete: ${args.path}")
      }
      forget(tree, args.path)
      null
    }
  }

  @Command
  fun available(invoke: Invoke) {
    val args = invoke.parseArgs(TreeArgs::class.java)
    work(invoke, readOnly = true) {
      val tree = Uri.parse(args.tree)
      val granted = resolver.persistedUriPermissions.any {
        it.uri == tree && it.isReadPermission && it.isWritePermission
      }
      JSObject().apply { put("value", granted && exists(tree, rootId(tree))) }
    }
  }

  // ── Picking a folder ───────────────────────────────────────────────────────

  private fun folderIntent() = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).addFlags(
    Intent.FLAG_GRANT_READ_URI_PERMISSION or
      Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
      Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION,
  )

  /** Keep access to the picked tree across launches; null if cancelled. */
  private fun granted(result: ActivityResult): Uri? {
    val uri = result.data?.data
    if (result.resultCode != Activity.RESULT_OK || uri == null) return null
    resolver.takePersistableUriPermission(
      uri,
      Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
    )
    return uri
  }

  @Command
  fun pickFolder(invoke: Invoke) {
    startActivityForResult(invoke, folderIntent(), "folderPicked")
  }

  @ActivityCallback
  private fun folderPicked(invoke: Invoke, result: ActivityResult) {
    val tree = granted(result) ?: return invoke.resolve(JSObject())
    work(invoke) {
      val name = displayName(tree, rootId(tree)) ?: "Vault"
      JSObject().apply {
        put("picked", JSObject().apply {
          put("root", tree.toString())
          put("name", name)
        })
      }
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
      if (find(tree, name) != null) {
        throw IllegalStateException(
          "A folder named \"$name\" already exists there. Open it instead, or choose another name.",
        )
      }
      mkdirs(tree, name)
      JSObject().apply {
        put("picked", JSObject().apply {
          put("root", "$tree|$name")
          put("name", name)
        })
      }
    }
  }
}
