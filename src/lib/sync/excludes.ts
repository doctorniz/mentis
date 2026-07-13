/**
 * Paths cloud sync never touches, in either direction (S3).
 *
 * Semantics: an excluded path is INVISIBLE to sync — never pushed,
 * never pulled, never deleted remotely, and stale manifest entries for
 * it are dropped without touching the remote copy. Old remote copies
 * uploaded before this feature stay on the provider as inert junk (a
 * user can delete them there) — silently deleting remote files would
 * be more surprising than leaving them.
 *
 * A pattern matches the exact path or anything under it as a folder
 * (`_marrow/snapshots` matches `_marrow/snapshots/x.pdf` but NOT
 * `_marrow/snapshots-old`).
 */

/**
 * Local-only artifacts every vault excludes:
 *  - `_marrow/snapshots` — pre-edit PDF backups; heavy and per-device.
 *  - `_marrow/search-index.json` — rebuilt on every vault open.
 */
export const DEFAULT_SYNC_EXCLUDES: readonly string[] = [
  '_marrow/snapshots',
  '_marrow/search-index.json',
]

function normalize(path: string): string {
  return path.replace(/^\/+/, '').replace(/\/+$/, '')
}

/** Build a matcher for the default excludes plus optional user patterns. */
export function buildSyncExcludeMatcher(extraPatterns?: string[]): (path: string) => boolean {
  const patterns = [...DEFAULT_SYNC_EXCLUDES, ...(extraPatterns ?? [])]
    .map(normalize)
    .filter(Boolean)
  return (path: string) => {
    const p = normalize(path)
    for (const pattern of patterns) {
      if (p === pattern || p.startsWith(pattern + '/')) return true
    }
    return false
  }
}

/** Convenience matcher with only the default excludes. */
export const isSyncExcluded: (path: string) => boolean = buildSyncExcludeMatcher()
