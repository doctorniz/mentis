import type { SyncManifestEntry } from './types'

/**
 * Pure conflict-resolution policy (last-write-wins), extracted from
 * SyncManager so it can be unit-tested without IndexedDB.
 */

export interface ConflictInput {
  /** Did the local file change since the last sync? */
  isLocallyChanged: boolean
  /** Hash the remote reports now. */
  remoteHash: string
  /** Remote modification timestamp (ISO). */
  remoteModifiedAt: string
  /** Prior sync record for this path, if any. */
  manifestEntry: SyncManifestEntry | null | undefined
}

export interface ConflictDecision {
  winner: 'local' | 'remote'
  /**
   * True only when BOTH sides changed since the last sync — the case
   * where one side's edits are actually discarded and the user should
   * be told. One-sided updates are ordinary sync traffic.
   */
  isTrueConflict: boolean
}

export function resolveSyncConflict(input: ConflictInput): ConflictDecision {
  const { manifestEntry } = input

  // No prior sync record: local is a fresh create — local wins.
  if (!manifestEntry) return { winner: 'local', isTrueConflict: false }

  // Remote unchanged since last sync: only local moved — local wins.
  if (manifestEntry.remoteHash === input.remoteHash) {
    return { winner: 'local', isTrueConflict: false }
  }

  // Local unchanged: only remote moved — remote wins.
  if (!input.isLocallyChanged) return { winner: 'remote', isTrueConflict: false }

  // Both changed: last-write-wins by remote mtime vs last sync; a tie
  // (or unparsable remote time) keeps local.
  const remoteTime = new Date(input.remoteModifiedAt).getTime()
  const lastSync = new Date(manifestEntry.lastSyncedAt).getTime()
  return { winner: remoteTime > lastSync ? 'remote' : 'local', isTrueConflict: true }
}
