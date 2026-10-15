import type { SyncManifestEntry } from './types'

/**
 * Where the losing side of a conflict is kept: beside the file, as
 * `Name (conflict 2026-10-13 14.32).ext` in local time. `suffix` is the
 * file type's suffix when it has more than one dot (`.kan.md`), so the
 * label goes before all of it; otherwise the last extension is used.
 */
export function conflictCopyPath(path: string, when: Date, suffix?: string): string {
  const slash = path.lastIndexOf('/')
  const dir = path.slice(0, slash + 1)
  const name = path.slice(slash + 1)
  const ext =
    suffix && name.toLowerCase().endsWith(suffix.toLowerCase()) && name.length > suffix.length
      ? name.slice(name.length - suffix.length)
      : name.lastIndexOf('.') > 0
        ? name.slice(name.lastIndexOf('.'))
        : ''
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp =
    `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ` +
    `${pad(when.getHours())}.${pad(when.getMinutes())}`
  return `${dir}${name.slice(0, name.length - ext.length)} (conflict ${stamp})${ext}`
}

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

/* ------------------------------------------------------------------ */
/*  Delta-pull decisions (S6)                                          */
/* ------------------------------------------------------------------ */
/*
 * The poll path (`applyRemoteChanges`) used to pull whenever the remote
 * hash moved and delete whenever the remote deleted — clobbering local
 * edits whose push had failed (e.g. offline). These two pure functions
 * give the delta path the SAME policy full sync applies, testable
 * without IndexedDB.
 *
 * Hash domains: `localHash` is our SHA-256 of the local bytes and only
 * comparable to `manifestEntry.localHash`; `remoteHash` is the
 * provider's own content hash and only comparable to
 * `manifestEntry.remoteHash`. The two are never cross-compared.
 */

export interface RemoteUpdateDecision {
  action: 'pull' | 'push-local' | 'none'
  isTrueConflict: boolean
}

/** A remote entry changed (or appeared) in a delta listing. */
export function decideRemoteUpdate(input: {
  manifestEntry: SyncManifestEntry | null | undefined
  /** SHA-256 of the current local bytes; null = missing/unreadable. */
  localHash: string | null
  remoteHash: string
  remoteModifiedAt: string
}): RemoteUpdateDecision {
  const { manifestEntry, localHash } = input

  // Already in sync with this remote state — nothing to do.
  if (manifestEntry && manifestEntry.remoteHash === input.remoteHash) {
    return { action: 'none', isTrueConflict: false }
  }

  // Never synced: a local file at the same path is a local create and
  // wins (same as full sync's no-record rule); no local file → pull.
  if (!manifestEntry) {
    return localHash === null
      ? { action: 'pull', isTrueConflict: false }
      : { action: 'push-local', isTrueConflict: false }
  }

  // Local missing (deleted or unreadable) or unchanged → take remote.
  if (localHash === null || localHash === manifestEntry.localHash) {
    return { action: 'pull', isTrueConflict: false }
  }

  // Both sides changed — defer to the shared last-write-wins policy.
  const { winner } = resolveSyncConflict({
    isLocallyChanged: true,
    remoteHash: input.remoteHash,
    remoteModifiedAt: input.remoteModifiedAt,
    manifestEntry,
  })
  return { action: winner === 'remote' ? 'pull' : 'push-local', isTrueConflict: true }
}

export type RemoteDeleteAction = 'delete-local' | 'push-local' | 'keep-local' | 'forget'

/** A remote entry was deleted in a delta listing. */
export function decideRemoteDelete(input: {
  manifestEntry: SyncManifestEntry | null | undefined
  localExists: boolean
  /** SHA-256 of the current local bytes; null = missing/unreadable. */
  localHash: string | null
}): RemoteDeleteAction {
  const { manifestEntry, localExists, localHash } = input

  // Nothing local: just forget the manifest row.
  if (!localExists) return 'forget'

  // Local file was never synced — it's a local create that happens to
  // share the path; the remote delete is not about it.
  if (!manifestEntry) return 'keep-local'

  // Unreadable local file: play safe, touch nothing.
  if (localHash === null) return 'keep-local'

  // Locally edited since last sync: the edit wins over the delete
  // (same as full sync's re-upload rule).
  if (localHash !== manifestEntry.localHash) return 'push-local'

  return 'delete-local'
}

/** A local delete found by full sync. `remoteHash` is null when the remote is gone too. */
export function decideLocalDelete(input: {
  manifestEntry: SyncManifestEntry
  remoteHash: string | null
}): 'trash-remote' | 'pull' | 'forget' {
  if (input.remoteHash === null) return 'forget'
  // Remote edited since the last sync: the edit wins over the delete
  // (the mirror of a local edit beating a remote delete).
  if (input.remoteHash !== input.manifestEntry.remoteHash) return 'pull'
  return 'trash-remote'
}

/* ------------------------------------------------------------------ */
/*  Mass-delete guard                                                  */
/* ------------------------------------------------------------------ */

export const DELETE_CONFIRM_MIN_FILES = 5
export const DELETE_CONFIRM_FRACTION = 0.1

/**
 * A run that would delete at least 5 files and more than 10% of the files
 * sync tracks asks first. A renamed or emptied remote folder, or a local
 * folder that reads as empty, looks exactly like a mass delete.
 */
export function needsDeleteConfirmation(deletes: number, tracked: number): boolean {
  return deletes >= DELETE_CONFIRM_MIN_FILES && deletes > tracked * DELETE_CONFIRM_FRACTION
}
