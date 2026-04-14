/**
 * Whether two vault-relative paths refer to the same file on typical host FS
 * (slash normalization + case-insensitive compare). Used so `exists(target)` does
 * not block a rename when the "collision" is the same inode (e.g. case-only rename
 * on Windows, or host/API quirks after an intermediate rename).
 */
export function vaultPathsPointToSameFile(a: string, b: string): boolean {
  if (a === b) return true
  const na = a.replace(/\\/g, '/').toLowerCase()
  const nb = b.replace(/\\/g, '/').toLowerCase()
  return na === nb
}
