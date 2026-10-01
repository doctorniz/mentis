import type { FileSystemAdapter } from '@/lib/fs'
import { isNotesTreeEntry } from '@/lib/notes/tree-filter'
import { toTreeRow } from '@/lib/notes/tree-listing'
import { fileTypes, titleForPath } from '@/core/registries'
import type { FileTypeDefinition, SearchExtraction } from '@/core/registries/file-types'
import type { ExtractRunner } from '@/core/index/extract'
import { extractInWorker } from '@/core/index/extract-client'
import type { IndexDocument, ManifestEntry, TreeListing } from '@/core/index/protocol'
import { planReconcile } from '@/core/index/reconcile'
import {
  getIndexManifest,
  putTreeListings,
  removeSearchDocuments,
  upsertSearchDocument,
  upsertSearchDocuments,
} from '@/lib/search/index'
import { announceIndexChanged } from '@/lib/search/index-events'

/**
 * Builds search documents from vault files. What a file contributes is its
 * module's business: each type with `search` support may supply an extractor
 * (`modules/<id>/search.ts`) that runs in a worker, so parsing never blocks
 * the UI and PDF.js, JSZip and SheetJS load only when a file of that type is
 * indexed. This file lists the vault, reads the files (the only I/O), and
 * assembles the documents.
 */

/**
 * Indexable files with the size and mtime `readdir` already reports. The walk
 * also notes each folder's tree entries in `listings`, so the file tree can
 * paint from the index next time at no extra reads.
 */
async function listIndexableFiles(
  fs: FileSystemAdapter,
  dir: string,
  acc: ManifestEntry[],
  listings: TreeListing[],
): Promise<void> {
  const entries = (await fs.readdir(dir)).filter(isNotesTreeEntry)
  listings.push({ dir, entries: entries.map(toTreeRow) })
  for (const e of entries) {
    if (e.isDirectory) {
      await listIndexableFiles(fs, e.path, acc, listings)
    } else if (fileTypes.resolve(e.path)?.search) {
      acc.push({
        path: e.path,
        size: e.size ?? 0,
        mtime: e.modifiedAt ? Date.parse(e.modifiedAt) : 0,
      })
    }
  }
}

async function extractFor(
  def: FileTypeDefinition,
  fs: FileSystemAdapter,
  path: string,
  run: ExtractRunner,
): Promise<SearchExtraction | null> {
  const read = def.search?.read
  if (!read) return { content: '' } // indexed by title only (e.g. drawings)
  try {
    const data = read === 'text' ? await fs.readTextFile(path) : await fs.readFile(path)
    return await run({ typeId: def.id, path, data })
  } catch {
    // Unreadable, or the extractor could not run. The file still appears in
    // results by title.
    return { content: '' }
  }
}

async function fileToDocument(
  fs: FileSystemAdapter,
  path: string,
  known?: ManifestEntry,
  run: ExtractRunner = extractInWorker,
): Promise<IndexDocument | null> {
  const def = fileTypes.resolve(path)
  if (!def?.search) return null

  let size = known?.size
  let mtime = known?.mtime
  if (size === undefined || mtime === undefined) {
    const stat = await fs.stat(path).catch(() => null)
    size = stat?.size ?? 0
    mtime = stat?.modifiedAt.getTime() ?? 0
  }

  const extracted = await extractFor(def, fs, path, run)
  if (!extracted) return null

  return {
    path,
    type: def.id,
    title: extracted.title || titleForPath(path),
    content: extracted.content,
    tags: extracted.tags ?? [],
    links: extracted.links ?? [],
    size,
    mtime,
  }
}

const BATCH = 25
/** Folders recorded per request to the index. */
const TREE_BATCH = 200
/** Files read and in flight to the extract worker at once. */
const IN_FLIGHT = 3

/**
 * Bring the index up to date with the vault: list it (metadata only), then
 * read and extract just the files that are new or changed since they were
 * indexed, and drop the ones that are gone. On a normal open that is almost
 * nothing; on a first open, or after the index was deleted, it is everything.
 *
 * Reading the next files overlaps with the worker extracting the last ones.
 * `isCancelled` is checked between files so a vault switch stops it cleanly.
 */
export function reconcileVaultSearchIndex(
  fs: FileSystemAdapter,
  isCancelled: () => boolean = () => false,
  run: ExtractRunner = extractInWorker,
): Promise<{ indexed: number; removed: number }> {
  const result = queue.then(() => reconcileNow(fs, isCancelled, run))
  queue = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

/** Reconciles run one at a time, so two callers never index the same files twice. */
let queue: Promise<void> = Promise.resolve()

async function reconcileNow(
  fs: FileSystemAdapter,
  isCancelled: () => boolean,
  run: ExtractRunner,
): Promise<{ indexed: number; removed: number }> {
  const vault: ManifestEntry[] = []
  const listings: TreeListing[] = []
  await listIndexableFiles(fs, '', vault, listings)
  if (isCancelled()) return { indexed: 0, removed: 0 }
  for (let i = 0; i < listings.length; i += TREE_BATCH) {
    await putTreeListings(listings.slice(i, i + TREE_BATCH))
  }

  const { toIndex, toRemove } = planReconcile(await getIndexManifest(), vault)
  if (isCancelled()) return { indexed: 0, removed: 0 }
  await removeSearchDocuments(toRemove)

  const byPath = new Map(vault.map((e) => [e.path, e]))
  let batch: IndexDocument[] = []
  let indexed = 0
  let next = 0

  async function flush() {
    if (batch.length === 0) return
    const docs = batch
    batch = []
    await upsertSearchDocuments(docs)
    indexed += docs.length
  }

  async function lane() {
    while (!isCancelled()) {
      const path = toIndex[next++]
      if (path === undefined) return
      const doc = await fileToDocument(fs, path, byPath.get(path), run)
      if (isCancelled()) return
      if (doc) batch.push(doc)
      if (batch.length >= BATCH) await flush()
    }
  }

  await Promise.all(Array.from({ length: Math.min(IN_FLIGHT, toIndex.length) }, lane))
  if (!isCancelled()) await flush()
  return { indexed, removed: toRemove.length }
}

const SOON_DELAY_MS = 1000
let soonTimer: ReturnType<typeof setTimeout> | undefined
let soonRunning = false
let soonAgain = false

/**
 * Ask for a reconcile shortly, for the times the index may be behind the vault
 * (a binary file was added, or sync brought files in). Requests made while one
 * is pending or running collapse into a single follow-up run.
 */
export function reconcileSoon(fs: FileSystemAdapter): void {
  clearTimeout(soonTimer)
  soonTimer = setTimeout(() => void runSoon(fs), SOON_DELAY_MS)
}

async function runSoon(fs: FileSystemAdapter): Promise<void> {
  if (soonRunning) {
    soonAgain = true
    return
  }
  soonRunning = true
  try {
    do {
      soonAgain = false
      const { indexed, removed } = await reconcileVaultSearchIndex(fs)
      if (indexed > 0 || removed > 0) announceIndexChanged()
    } while (soonAgain)
  } catch {
    // The next request tries again.
  } finally {
    soonRunning = false
  }
}

/** Incremental update for one file path after save. Routes by type. */
export async function reindexFilePath(
  fs: FileSystemAdapter,
  path: string,
  run: ExtractRunner = extractInWorker,
): Promise<void> {
  const doc = await fileToDocument(fs, path, undefined, run)
  if (doc) {
    await upsertSearchDocument(doc)
    announceIndexChanged()
  }
}

/** @deprecated Use reindexFilePath instead. */
export async function reindexMarkdownPath(fs: FileSystemAdapter, path: string): Promise<void> {
  return reindexFilePath(fs, path)
}

/**
 * True for types cheap enough to reindex after a rename/move/save (text
 * formats). Heavy binary formats are picked up by the next reconcile.
 */
export function isIndexableTextPath(path: string): boolean {
  return fileTypes.resolve(path)?.search?.reindexOnSave === true
}
