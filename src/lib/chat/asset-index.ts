/**
 * Path → chatAssetId index for documents that can't carry the id inline.
 *
 * Markdown notes embed `chatAssetId` in their frontmatter so the id
 * travels with the file when it's renamed or moved. PDFs (and any
 * future binary format) have no equivalent place to stash the id, so
 * we keep a single JSON index at `_marrow/_chats/index.json`.
 *
 * Schema v2 (AI5): each entry stores a content fingerprint (byte size +
 * SHA-256) alongside the id. When a chat opens on a PDF the index does
 * not know, we fingerprint it and look for a DANGLING entry (its path
 * no longer exists) with the same fingerprint — exactly one match means
 * the file was renamed/moved out-of-band (OS file browser, sync, or an
 * in-app rename that predates this wiring) and the old id is adopted,
 * bringing its chat threads back. Ambiguous or absent matches mint a
 * fresh id as before.
 *
 * Limitations (accepted): a PDF that was EDITED after the rename but
 * before the next chat open hashes differently and won't reconcile;
 * entries migrated from schema v1 have no fingerprint until their file
 * is chat-opened once, so files renamed before that first open can't be
 * reconciled either.
 *
 * Writes are crash-safe (temp file + rename), same pattern as
 * `chat-io.ts`.
 */

import type { FileSystemAdapter } from '@/lib/fs'
import { MARROW_DIR } from '@/types/vault'
import { hashBytes } from '@/lib/sync/change-detector'
import { CHATS_DIR } from './chat-io'

export const CHAT_ASSET_INDEX_PATH = `${CHATS_DIR}/index.json`
const SCHEMA_VERSION = 2

interface IndexEntry {
  id: string
  /** Content fingerprint — absent on entries migrated from schema v1. */
  size?: number
  hash?: string
}

interface IndexShape {
  schemaVersion: number
  /** Vault-relative path → entry. */
  entries: Record<string, IndexEntry>
}

async function ensureDir(vaultFs: FileSystemAdapter, path: string): Promise<void> {
  try {
    await vaultFs.mkdir(path)
  } catch {
    /* idempotent */
  }
}

async function readIndex(vaultFs: FileSystemAdapter): Promise<IndexShape> {
  try {
    const raw = await vaultFs.readTextFile(CHAT_ASSET_INDEX_PATH)
    const parsed = JSON.parse(raw) as {
      schemaVersion?: unknown
      entries?: Record<string, unknown>
    }
    if (!parsed || typeof parsed !== 'object' || typeof parsed.entries !== 'object') {
      return { schemaVersion: SCHEMA_VERSION, entries: {} }
    }

    // v1 stored bare uuid strings; v2 stores { id, size?, hash? }.
    // Both migrate/normalize into v2 in memory; the next write persists it.
    const entries: Record<string, IndexEntry> = {}
    for (const [path, value] of Object.entries(parsed.entries ?? {})) {
      if (typeof value === 'string' && value) {
        entries[path] = { id: value }
      } else if (value && typeof value === 'object') {
        const e = value as { id?: unknown; size?: unknown; hash?: unknown }
        if (typeof e.id === 'string' && e.id) {
          entries[path] = {
            id: e.id,
            ...(typeof e.size === 'number' ? { size: e.size } : {}),
            ...(typeof e.hash === 'string' ? { hash: e.hash } : {}),
          }
        }
      }
    }
    return { schemaVersion: SCHEMA_VERSION, entries }
  } catch {
    // Missing or unreadable → empty index. We'll write one on first insert.
    return { schemaVersion: SCHEMA_VERSION, entries: {} }
  }
}

async function writeIndex(vaultFs: FileSystemAdapter, next: IndexShape): Promise<void> {
  await ensureDir(vaultFs, MARROW_DIR)
  await ensureDir(vaultFs, CHATS_DIR)
  const finalPath = CHAT_ASSET_INDEX_PATH
  const tmpPath = `${finalPath}.tmp`
  const json = JSON.stringify(next, null, 2)
  await vaultFs.writeTextFile(tmpPath, json)
  try {
    try {
      await vaultFs.rename(tmpPath, finalPath)
    } catch {
      await vaultFs.remove(finalPath).catch(() => undefined)
      await vaultFs.rename(tmpPath, finalPath)
    }
  } catch (err) {
    await vaultFs.remove(tmpPath).catch(() => undefined)
    throw err
  }
}

/** Look up the chatAssetId for a document path, or `null` if none. */
export async function lookupChatAssetId(
  vaultFs: FileSystemAdapter,
  documentPath: string,
): Promise<string | null> {
  const idx = await readIndex(vaultFs)
  return idx.entries[documentPath]?.id ?? null
}

/**
 * Fingerprint the document's current bytes. Returns null when the file
 * can't be read — callers then skip fingerprint-dependent behavior.
 */
async function fingerprintFile(
  vaultFs: FileSystemAdapter,
  path: string,
): Promise<{ size: number; hash: string } | null> {
  try {
    const data = await vaultFs.readFile(path)
    return { size: data.length, hash: await hashBytes(data) }
  } catch {
    return null
  }
}

/**
 * Ensure a document has a `chatAssetId` in the index; mint one and
 * persist it if missing. Idempotent — safe to call repeatedly.
 *
 * Known path → refresh the fingerprint when the size changed (PDF saves
 * are destructive byte rewrites) so reconciliation stays possible after
 * future renames. Unknown path → attempt fingerprint reconciliation
 * against dangling entries before minting.
 */
export async function ensureChatAssetIdForPath(
  vaultFs: FileSystemAdapter,
  documentPath: string,
): Promise<string> {
  const idx = await readIndex(vaultFs)
  const existing = idx.entries[documentPath]

  if (existing) {
    // Refresh a missing/stale fingerprint. Size is the cheap staleness
    // check (stat only); the hash is recomputed only when it moved.
    let size: number | undefined
    try {
      size = (await vaultFs.stat(documentPath)).size
    } catch {
      size = undefined
    }
    if (size !== undefined && (existing.hash === undefined || existing.size !== size)) {
      const fp = await fingerprintFile(vaultFs, documentPath)
      if (fp) {
        await writeIndex(vaultFs, {
          schemaVersion: SCHEMA_VERSION,
          entries: { ...idx.entries, [documentPath]: { id: existing.id, ...fp } },
        })
      }
    }
    return existing.id
  }

  const fp = await fingerprintFile(vaultFs, documentPath)

  // Reconciliation (AI5): the index doesn't know this path. If exactly
  // one DANGLING entry (file gone) has the same content fingerprint,
  // this is that file after an out-of-band rename — adopt its id so the
  // chat threads follow.
  if (fp) {
    const candidates: string[] = []
    for (const [path, entry] of Object.entries(idx.entries)) {
      if (entry.hash !== fp.hash || entry.size !== fp.size) continue
      if (await vaultFs.exists(path)) continue // a copy, not a rename
      candidates.push(path)
    }
    if (candidates.length === 1) {
      const oldPath = candidates[0]
      const adopted = idx.entries[oldPath].id
      const entries = { ...idx.entries }
      delete entries[oldPath]
      entries[documentPath] = { id: adopted, ...fp }
      await writeIndex(vaultFs, { schemaVersion: SCHEMA_VERSION, entries })
      return adopted
    }
  }

  const minted = crypto.randomUUID()
  await writeIndex(vaultFs, {
    schemaVersion: SCHEMA_VERSION,
    entries: { ...idx.entries, [documentPath]: { id: minted, ...(fp ?? {}) } },
  })
  return minted
}

/**
 * Rewrite the index entry after a file rename/move. If the old path
 * wasn't indexed this is a no-op (an out-of-band rename is later healed
 * by fingerprint reconciliation in `ensureChatAssetIdForPath`).
 */
export async function movePdfChatAssetId(
  vaultFs: FileSystemAdapter,
  oldPath: string,
  newPath: string,
): Promise<void> {
  if (oldPath === newPath) return
  const idx = await readIndex(vaultFs)
  const entry = idx.entries[oldPath]
  if (!entry) return
  const nextEntries = { ...idx.entries }
  delete nextEntries[oldPath]
  nextEntries[newPath] = entry
  await writeIndex(vaultFs, {
    schemaVersion: SCHEMA_VERSION,
    entries: nextEntries,
  })
}

/** Remove an entry from the index (e.g. after file deletion). */
export async function dropChatAssetId(
  vaultFs: FileSystemAdapter,
  documentPath: string,
): Promise<void> {
  const idx = await readIndex(vaultFs)
  if (!(documentPath in idx.entries)) return
  const nextEntries = { ...idx.entries }
  delete nextEntries[documentPath]
  await writeIndex(vaultFs, {
    schemaVersion: SCHEMA_VERSION,
    entries: nextEntries,
  })
}
