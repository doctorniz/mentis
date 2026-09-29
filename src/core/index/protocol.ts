import type { SearchFilters, SearchResult } from '@/types/search'

/** A file's entry in the index, as produced by its file type's extractor. */
export interface IndexDocument {
  path: string
  /** File-type registry id. */
  type: string
  title: string
  content: string
  tags: string[]
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

/** A file's SHA-256 at the size and mtime it had when hashed. */
export interface FileHash extends ManifestEntry {
  hash: string
}

/** A search hit with its full indexed content, for retrieval. */
export interface SearchHit {
  path: string
  title: string
  type: string
  score: number
  content: string
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
  upsert: [{ vaultId: string; docs: IndexDocument[] }, void]
  remove: [{ vaultId: string; paths: string[] }, void]
  search: [{ query: string; filters?: SearchFilters }, SearchResult[]]
  searchDocuments: [{ query: string; topK: number }, SearchHit[]]
  /** Prune the hash cache to `files` and return the hashes still valid. */
  validHashes: [{ vaultId: string; files: ManifestEntry[] }, Record<string, string>]
  putHashes: [{ vaultId: string; hashes: FileHash[] }, void]
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
