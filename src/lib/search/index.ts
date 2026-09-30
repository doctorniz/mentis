import type { SearchFilters, SearchResult } from '@/types/search'
import { callIndex, indexWorkerStarted } from '@/core/index/client'
import type {
  FileHash,
  IndexDocument,
  LinkRow,
  ManifestEntry,
  OpenResult,
  PassageHit,
} from '@/core/index/protocol'

/**
 * Vault search, backed by the SQLite + FTS5 index in the index worker
 * (`core/index`). Queries run off the main thread; writes are fire-and-forget
 * and applied in order.
 */

let activeVaultId: string | null = null

let markOpen: () => void = () => {}
let opened = new Promise<void>((resolve) => (markOpen = resolve))

/** Open (or create) the index for a vault. Search answers from it at once. */
export function openSearchIndex(vaultId: string): Promise<OpenResult> {
  activeVaultId = vaultId
  const result = callIndex('open', { vaultId })
  void result.then(() => markOpen()).catch(() => {})
  return result
}

/** Close the index on vault close. The database stays on disk. */
export function clearSearchIndex(): void {
  activeVaultId = null
  opened = new Promise<void>((resolve) => (markOpen = resolve))
  if (indexWorkerStarted()) void callIndex('close', undefined).catch(() => {})
}

/**
 * Resolves once the current vault's index is open, so readers that mount
 * before the index opens get its contents rather than an empty answer.
 */
export function whenSearchIndexOpen(): Promise<void> {
  return opened
}

export function getIndexManifest(): Promise<ManifestEntry[]> {
  return callIndex('manifest', undefined)
}

/** Every wiki-link in the indexed vault, as written (unresolved). */
export function getIndexLinks(): Promise<LinkRow[]> {
  return callIndex('links', undefined)
}

export function upsertSearchDocuments(docs: IndexDocument[]): Promise<void> {
  if (!activeVaultId || docs.length === 0) return Promise.resolve()
  return callIndex('upsert', { vaultId: activeVaultId, docs })
}

export function upsertSearchDocument(doc: IndexDocument): Promise<void> {
  return upsertSearchDocuments([doc])
}

export function removeSearchDocuments(paths: string[]): Promise<void> {
  if (!activeVaultId || paths.length === 0) return Promise.resolve()
  return callIndex('remove', { vaultId: activeVaultId, paths })
}

/** Drop one path from the index (after delete, rename or move). */
export function removeSearchDocument(path: string): void {
  void removeSearchDocuments([path]).catch(() => {})
}

/**
 * Run search with optional `#tag` tokens in `rawQuery` (AND with `filters.tags`).
 */
export function searchVault(
  rawQuery: string,
  filters: SearchFilters = {},
): Promise<SearchResult[]> {
  if (!activeVaultId) return Promise.resolve([])
  return callIndex('search', { query: rawQuery, filters })
}

/** The `limit` best-matching passages from anywhere in the vault's files, for vault chat. */
export function searchPassages(query: string, limit: number): Promise<PassageHit[]> {
  if (!activeVaultId) return Promise.resolve([])
  return callIndex('searchPassages', { query, limit })
}

/* ---- Hash cache for sync change detection ---- */

const HASH_CACHE_WAIT_MS = 5_000

/**
 * Hashes still valid for `files` (same size and mtime as when hashed), after
 * pruning the cache to them. `null` when the index is not open within a few
 * seconds — callers then hash everything, so sync never waits on the index.
 */
export async function validFileHashes(
  files: ManifestEntry[],
): Promise<Record<string, string> | null> {
  const open = await Promise.race([
    whenSearchIndexOpen().then(() => true),
    new Promise<false>((resolve) => setTimeout(() => resolve(false), HASH_CACHE_WAIT_MS)),
  ])
  if (!open || !activeVaultId) return null
  return callIndex('validHashes', { vaultId: activeVaultId, files })
}

export function putFileHashes(hashes: FileHash[]): Promise<void> {
  if (!activeVaultId || hashes.length === 0) return Promise.resolve()
  return callIndex('putHashes', { vaultId: activeVaultId, hashes })
}
