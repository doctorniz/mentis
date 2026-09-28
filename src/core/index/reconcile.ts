import type { ManifestEntry } from './protocol'

export interface ReconcilePlan {
  /** New files, and files whose size or mtime differ from the manifest. */
  toIndex: string[]
  /** Indexed files no longer in the vault. */
  toRemove: string[]
}

/**
 * Compare what the vault holds now with what the index recorded. Only
 * metadata is compared — no file is read to decide.
 */
export function planReconcile(
  manifest: readonly ManifestEntry[],
  vault: readonly ManifestEntry[],
): ReconcilePlan {
  const known = new Map(manifest.map((e) => [e.path, e]))
  const toIndex: string[] = []
  for (const file of vault) {
    const prev = known.get(file.path)
    known.delete(file.path)
    if (!prev || prev.size !== file.size || prev.mtime !== file.mtime) toIndex.push(file.path)
  }
  return { toIndex, toRemove: [...known.keys()] }
}
