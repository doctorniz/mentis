package app.mentis

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.DocumentsContract.Document
import org.json.JSONArray
import org.json.JSONObject
import java.io.FileNotFoundException
import java.util.Collections

/**
 * Files in a folder the user picked through the Storage Access Framework. A
 * vault path is resolved to a document inside the picked tree.
 *
 * The Rust side (src-tauri/src/saf.rs) calls the `@JvmStatic` functions over
 * JNI from its own threads, so calls run in parallel and never wait on the UI
 * thread. Reads and writes hand back a file descriptor rather than the bytes.
 * Failures are thrown; Rust reads the exception's message.
 */
object SafStore {
  private const val EXTERNAL_STORAGE = "com.android.externalstorage.documents"
  private const val BINARY = "application/octet-stream"

  @Volatile private var context: Context? = null

  private val resolver: ContentResolver
    get() = (context ?: throw IllegalStateException("picked folders are not ready")).contentResolver

  /** Document ids by "tree\u0000path", for providers whose ids are opaque. */
  private val ids: MutableMap<String, String> = Collections.synchronizedMap(
    object : LinkedHashMap<String, String>(256, 0.75f, true) {
      override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, String>?) = size > 4096
    },
  )

  fun init(context: Context) {
    this.context = context.applicationContext
  }

  /** Files may have changed in another app while this one was away. */
  fun forgetAll() = ids.clear()

  // ── Resolving paths ────────────────────────────────────────────────────────

  fun docUri(tree: Uri, id: String): Uri = DocumentsContract.buildDocumentUriUsingTree(tree, id)

  fun rootId(tree: Uri): String = DocumentsContract.getTreeDocumentId(tree)

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
  fun find(tree: Uri, path: String, verify: Boolean = true): String? {
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
  fun mkdirs(tree: Uri, path: String): String {
    var id = rootId(tree)
    if (path.isEmpty()) return id
    var sofar = ""
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

  private fun statOf(tree: Uri, id: String): JSONObject? = try {
    resolver.query(
      docUri(tree, id),
      arrayOf(Document.COLUMN_MIME_TYPE, Document.COLUMN_SIZE, Document.COLUMN_LAST_MODIFIED),
      null, null, null,
    )?.use { c ->
      if (!c.moveToFirst()) {
        null
      } else {
        JSONObject().apply {
          put("isDirectory", c.getString(0) == Document.MIME_TYPE_DIR)
          put("size", if (c.isNull(1)) 0 else c.getLong(1))
          val mtime = if (c.isNull(2)) 0L else c.getLong(2)
          if (mtime > 0) put("mtime", mtime.toDouble())
        }
      }
    }
  } catch (e: Exception) {
    // A missing document: with phone storage ids built unchecked, the provider
    // reports it as FileNotFoundException or as IllegalArgumentException.
    null
  }

  fun displayName(tree: Uri, id: String): String? = try {
    resolver.query(docUri(tree, id), arrayOf(Document.COLUMN_DISPLAY_NAME), null, null, null)
      ?.use { if (it.moveToFirst()) it.getString(0) else null }
  } catch (e: Exception) {
    null
  }

  // ── Called from Rust ───────────────────────────────────────────────────────

  /** `{isDirectory, size, mtime?}`, or null if there is nothing at `path`. */
  @JvmStatic
  fun stat(tree: String, path: String): String? {
    val uri = Uri.parse(tree)
    return find(uri, path, verify = false)?.let { statOf(uri, it) }?.toString()
  }

  /** `[{name, isDirectory, size, mtime?}]` for the folder at `path`. */
  @JvmStatic
  fun list(tree: String, path: String): String {
    val uri = Uri.parse(tree)
    val id = find(uri, path) ?: throw FileNotFoundException("not found: $path")
    val entries = JSONArray()
    resolver.query(
      DocumentsContract.buildChildDocumentsUriUsingTree(uri, id),
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
        val child = if (path.isEmpty()) name else "$path/$name"
        if (uri.authority != EXTERNAL_STORAGE) ids[key(uri, child)] = c.getString(0)
        entries.put(JSONObject().apply {
          put("name", name)
          put("isDirectory", c.getString(2) == Document.MIME_TYPE_DIR)
          put("size", if (c.isNull(3)) 0 else c.getLong(3))
          val mtime = if (c.isNull(4)) 0L else c.getLong(4)
          if (mtime > 0) put("mtime", mtime.toDouble())
        })
      }
    }
    return entries.toString()
  }

  @JvmStatic
  fun mkdirs(tree: String, path: String) {
    mkdirs(Uri.parse(tree), path)
  }

  /**
   * A file descriptor for `path`, owned by the caller: opened for reading, or
   * for writing (created with its folders if missing, and truncated).
   */
  @JvmStatic
  fun openFd(tree: String, path: String, write: Boolean): Int {
    val uri = Uri.parse(tree)
    val id = find(uri, path, verify = write) ?: if (write) {
      val parent = mkdirs(uri, parentOf(path))
      val made = DocumentsContract.createDocument(resolver, docUri(uri, parent), BINARY, nameOf(path))
        ?: throw FileNotFoundException("could not create: $path")
      DocumentsContract.getDocumentId(made).also { ids[key(uri, path)] = it }
    } else {
      throw FileNotFoundException("not found: $path")
    }
    val pfd = try {
      resolver.openFileDescriptor(docUri(uri, id), if (write) "wt" else "r")
    } catch (e: Exception) {
      // Phone storage ids are built unchecked; a missing file shows up here.
      if (!write) throw FileNotFoundException("not found: $path")
      throw e
    } ?: throw FileNotFoundException("could not open: $path")
    return pfd.detachFd()
  }

  @JvmStatic
  fun rename(tree: String, from: String, to: String) {
    val uri = Uri.parse(tree)
    val id = find(uri, from) ?: throw FileNotFoundException("not found: $from")
    // As on disk, a file already at the destination is replaced.
    find(uri, to)?.let { existing ->
      if (existing != id) DocumentsContract.deleteDocument(resolver, docUri(uri, existing))
    }
    var doc = docUri(uri, id)
    if (parentOf(from) != parentOf(to)) {
      val source = find(uri, parentOf(from)) ?: rootId(uri)
      val target = mkdirs(uri, parentOf(to))
      doc = DocumentsContract.moveDocument(resolver, doc, docUri(uri, source), docUri(uri, target))
        ?: throw FileNotFoundException("could not move: $from")
    }
    if (nameOf(from) != nameOf(to)) {
      DocumentsContract.renameDocument(resolver, doc, nameOf(to))
        ?: throw FileNotFoundException("could not rename: $from")
    }
    forget(uri, from)
    forget(uri, to)
  }

  /** A file, or a folder with everything in it. */
  @JvmStatic
  fun delete(tree: String, path: String) {
    val uri = Uri.parse(tree)
    val id = find(uri, path) ?: throw FileNotFoundException("not found: $path")
    if (!DocumentsContract.deleteDocument(resolver, docUri(uri, id))) {
      throw FileNotFoundException("could not delete: $path")
    }
    forget(uri, path)
  }

  /** Whether the app may still use the tree: the grant is kept and the folder is there. */
  @JvmStatic
  fun available(tree: String): Boolean {
    val uri = Uri.parse(tree)
    val granted = resolver.persistedUriPermissions.any {
      it.uri == uri && it.isReadPermission && it.isWritePermission
    }
    return granted && exists(uri, rootId(uri))
  }
}
