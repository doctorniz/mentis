import type { SearchFilters, SearchResult } from '@/types/search'
import { toIndexFilters } from './filters'
import { callIndex, indexWorkerStarted } from '@/core/index/client'
import type {
  FileHash,
  IndexDocument,
  LinkRow,
  ManifestEntry,
  OpenResult,
  PassageHit,
  TreeListing,
  TreeRow,
} from '@/core/index/protocol'

/**
 * Vault search, backed by the SQLite + FTS5 index in the index worker
 * (`core/index`). Queries run off the main thread; writes are fire-and-forget
 * and applied in order.
 */

let activeVaultId: string | null = null

let markOpen: () => void = () => {}
let opened = new Promise<void>((resolve) => (markOpen = resolve))
let indexIsOpen = false

/** Open (or create) the index for a vault. Search answers from it at once. */
export function openSearchIndex(vaultId: string): Promise<OpenResult> {
  activeVaultId = vaultId
  const result = callIndex('open', { vaultId })
  void result
    .then(() => {
      if (activeVaultId === vaultId) indexIsOpen = true
      markOpen()
    })
    .catch(() => {})
  return result
}

/** Close the index on vault close. The database stays on disk. */
export function clearSearchIndex(): void {
  activeVaultId = null
  indexIsOpen = false
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

/** True once the current vault's index is open. Never waits. */
export function isSearchIndexOpen(): boolean {
  return indexIsOpen
}

/** One folder's entries as last recorded, or null if it was never listed. */
export function getTreeChildren(dir: string): Promise<TreeRow[] | null> {
  if (!indexIsOpen) return Promise.resolve(null)
  return callIndex('children', { dir })
}

/** Record what each folder in `listings` contains. */
export function putTreeListings(listings: TreeListing[]): Promise<void> {
  if (!activeVaultId || listings.length === 0) return Promise.resolve()
  return callIndex('setChildren', { vaultId: activeVaultId, listings })
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
  return callIndex('search', { query: rawQuery, filters: toIndexFilters(filters) })
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
