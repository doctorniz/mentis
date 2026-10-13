import type { FileSystemAdapter } from './types'

export interface PathChangeListeners {
  /** After a file or folder moved from `from` to `to`. */
  onRename?: (from: string, to: string) => void
  /** After a file or folder at `path` was deleted. */
  onRemove?: (path: string) => void
}

/**
 * Wraps an adapter so listeners hear about every successful rename and
 * delete made through it, whichever feature made them.
 */
export function trackPathChanges(
  inner: FileSystemAdapter,
  listeners: PathChangeListeners,
): FileSystemAdapter {
  return {
    type: inner.type,
    init: () => inner.init(),
    readFile: (path) => inner.readFile(path),
    readTextFile: (path) => inner.readTextFile(path),
    writeFile: (path, data) => inner.writeFile(path, data),
    writeTextFile: (path, content) => inner.writeTextFile(path, content),
    exists: (path) => inner.exists(path),
    stat: (path) => inner.stat(path),
    mkdir: (path) => inner.mkdir(path),
    readdir: (path) => inner.readdir(path),
    copy: (from, to) => inner.copy(from, to),

    async rename(from, to) {
      await inner.rename(from, to)
      listeners.onRename?.(from, to)
    },
    async remove(path) {
      await inner.remove(path)
      listeners.onRemove?.(path)
    },
    async removeDir(path) {
      await inner.removeDir(path)
      listeners.onRemove?.(path)
    },

    ...(inner.watch ? { watch: (path, callback) => inner.watch!(path, callback) } : {}),
  }
}
