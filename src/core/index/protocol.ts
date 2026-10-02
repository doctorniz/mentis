import type { SearchFilters, SearchResult } from '@/types/search'

/**
 * Search filters as the index stores take them. The date range is already
 * instants (epoch ms), so both stores agree whatever the time zone: callers
 * turn the calendar days of `SearchFilters.dateRange` into instants first.
 */
export interface IndexSearchFilters extends Omit<SearchFilters, 'dateRange'> {
  /** Only files modified at or after this instant. */
  modifiedFrom?: number
  /** Only files modified at or before this instant. */
  modifiedTo?: number
}

/** A file's entry in the index, as produced by its file type's extractor. */
export interface IndexDocument {
  path: string
  /** File-type registry id. */
  type: string
  title: string
  content: string
  tags: string[]
  /** Raw wiki-link targets in the file (unresolved). */
  links?: string[]
  size: number
  /** Last-modified time, ms since epoch. */
  mtime: number
}

/** What the index knew about a file when it indexed it. */
export interface ManifestEntry {
  path: string
  size: number
  mtime: number
}

/** One entry of the file tree: a folder, or a file of a registered type. */
export interface TreeRow {
  name: string
  path: string
  isDirectory: boolean
  size: number
  mtime: number
}

/** What the tree knew about one folder's contents when it was last listed. */
export interface TreeListing {
  /** Vault-relative folder path; '' is the vault root. */
  dir: string
  entries: TreeRow[]
}

/** One wiki-link as written: the file it is in, and its unresolved target. */
export interface LinkRow {
  source: string
  target: string
}

/** A file's SHA-256 at the size and mtime it had when hashed. */
export interface FileHash extends ManifestEntry {
  hash: string
}

/** A passage of a file that matched a retrieval query. `seq` is its order in the file. */
export interface PassageHit {
  path: string
  title: string
  type: string
  seq: number
  text: string
  score: number
  queryTerms: string[]
}

export interface OpenResult {
  /**
   * False when the database could not be kept on disk (for example another tab
   * holds it). The index then lives in memory and is rebuilt on each open.
   */
  persisted: boolean
  fileCount: number
}

/** Requests the index worker handles: name → [argument, result]. */
export interface IndexOps {
  open: [{ vaultId: string }, OpenResult]
  close: [void, void]
  manifest: [void, ManifestEntry[]]
  /** Every wiki-link in the vault, as written. Resolving them is the caller's job. */
  links: [void, LinkRow[]]
  upsert: [{ vaultId: string; docs: IndexDocument[] }, void]
  remove: [{ vaultId: string; paths: string[] }, void]
  search: [{ query: string; filters?: IndexSearchFilters }, SearchResult[]]
  searchPassages: [{ query: string; limit: number }, PassageHit[]]
  /** Prune the hash cache to `files` and return the hashes still valid. */
  validHashes: [{ vaultId: string; files: ManifestEntry[] }, Record<string, string>]
  putHashes: [{ vaultId: string; hashes: FileHash[] }, void]
  /** One folder's entries as last listed, or null if that folder was never listed. */
  children: [{ dir: string }, TreeRow[] | null]
  /** Replace what is recorded for each folder listed; folders that vanished are forgotten with their contents. */
  setChildren: [{ vaultId: string; listings: TreeListing[] }, void]
}

export type IndexOp = keyof IndexOps

export interface IndexRequest<K extends IndexOp = IndexOp> {
  id: number
  op: K
  arg: IndexOps[K][0]
}

export type IndexResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }
