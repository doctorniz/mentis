// Lives outside markdown-note-editor.tsx so the file tree can await an
// in-flight save without importing (and eagerly loading) the editor.

/**
 * Tracks the in-flight unmount-save flush per vault path so the next mount
 * of the same path can await it before reading the file from disk — the
 * same race the canvas editor guards against with `pendingCanvasSaves`.
 * Without this, closing a tab and immediately reopening the same note can
 * read stale bytes and overwrite the edit that was still being written.
 */
export const pendingMarkdownSaves = new Map<string, Promise<void>>()

/**
 * Await the in-flight unmount flush-save for `path`, if any. Deleting an
 * open note must close its tab first and then wait here — otherwise the
 * unmount save runs after the delete and resurrects the file from memory.
 */
export function awaitPendingMarkdownSave(path: string): Promise<void> {
  return pendingMarkdownSaves.get(path) ?? Promise.resolve()
}
