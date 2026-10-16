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
 * (`_mentis/snapshots` matches `_mentis/snapshots/x.pdf` but NOT
 * `_mentis/snapshots-old`).
 */

/**
 * Every vault also excludes any file or folder whose name starts with a dot,
 * at any depth: `.git`, `.obsidian`, `.trash`, `.DS_Store`, and the hidden
 * temp files of interrupted desktop saves. The app hides these everywhere
 * else too.
 *
 * Local-only artifacts every vault excludes:
 *  - `_mentis/snapshots` — pre-edit PDF backups; heavy and per-device.
 *  - `_mentis/search-index.json` — rebuilt on every vault open.
 *  - `_mentis/trash` — files sync deleted; each side keeps its own.
 */
export const DEFAULT_SYNC_EXCLUDES: readonly string[] = [
  '_mentis/snapshots',
  '_mentis/search-index.json',
  '_mentis/trash',
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
    if (p.split('/').some((seg) => seg.startsWith('.'))) return true
    for (const pattern of patterns) {
      if (p === pattern || p.startsWith(pattern + '/')) return true
    }
    return false
  }
}

/** Convenience matcher with only the default excludes. */
export const isSyncExcluded: (path: string) => boolean = buildSyncExcludeMatcher()
