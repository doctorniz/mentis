import type { SearchFilters, SearchResult } from '@/types/search'
import { callIndex, indexWorkerStarted } from '@/core/index/client'
import type { IndexDocument, ManifestEntry, OpenResult, SearchHit } from '@/core/index/protocol'

/**
 * Vault search, backed by the SQLite + FTS5 index in the index worker
 * (`core/index`). Queries run off the main thread; writes are fire-and-forget
 * and applied in order.
 */

let activeVaultId: string | null = null

/** Open (or create) the index for a vault. Search answers from it at once. */
export function openSearchIndex(vaultId: string): Promise<OpenResult> {
  activeVaultId = vaultId
  return callIndex('open', { vaultId })
}

/** Close the index on vault close. The database stays on disk. */
export function clearSearchIndex(): void {
  activeVaultId = null
  if (indexWorkerStarted()) void callIndex('close', undefined).catch(() => {})
}

export function getIndexManifest(): Promise<ManifestEntry[]> {
  return callIndex('manifest', undefined)
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

/** Top `topK` hits with their full indexed text, for vault chat retrieval. */
export function searchDocuments(query: string, topK: number): Promise<SearchHit[]> {
  if (!activeVaultId) return Promise.resolve([])
  return callIndex('searchDocuments', { query, topK })
}
