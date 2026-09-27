// Lives outside canvas-editor.tsx so vault maintenance can await in-flight
// saves without importing (and eagerly loading) the canvas editor.

/**
 * Outstanding unmount-flush promises, keyed by canvas file path.
 *
 * When a canvas editor unmounts, it schedules an async
 * `flushSave → engine.destroy` sequence. The next mount of the same path
 * must await that promise before reading the file from disk, otherwise
 * it sees stale bytes. This map is the hand-off — unmount writes to it,
 * the next mount reads and awaits, then deletes the entry.
 *
 * Module scope (not a ref) because the new mount is a fresh component
 * instance with no shared React refs.
 */
export const pendingCanvasSaves = new Map<string, Promise<void>>()

/**
 * Await every in-flight unmount flush. Vault maintenance (the drawings
 * orphan reaper) must not scan while a canvas is mid-save — PNGs are
 * written before the JSON, so a half-flushed canvas can make a brand-new
 * layer's PNG look stale.
 */
export async function awaitPendingCanvasSaves(): Promise<void> {
  await Promise.allSettled([...pendingCanvasSaves.values()])
}
