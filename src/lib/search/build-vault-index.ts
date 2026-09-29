import type { FileSystemAdapter } from '@/lib/fs'
import { isNotesTreeHidden } from '@/lib/notes/tree-filter'
import { fileTypes, titleForPath } from '@/core/registries'
import type { FileTypeDefinition, SearchExtraction } from '@/core/registries/file-types'
import type { ExtractRunner } from '@/core/index/extract'
import { extractInWorker } from '@/core/index/extract-client'
import type { IndexDocument, ManifestEntry } from '@/core/index/protocol'
import { planReconcile } from '@/core/index/reconcile'
import {
  getIndexManifest,
  removeSearchDocuments,
  upsertSearchDocument,
  upsertSearchDocuments,
} from '@/lib/search/index'

/**
 * Builds search documents from vault files. What a file contributes is its
 * module's business: each type with `search` support may supply an extractor
 * (`modules/<id>/search.ts`) that runs in a worker, so parsing never blocks
 * the UI and PDF.js, JSZip and SheetJS load only when a file of that type is
 * indexed. This file lists the vault, reads the files (the only I/O), and
 * assembles the documents.
 */

/** Indexable files with the size and mtime `readdir` already reports. */
async function listIndexableFiles(
  fs: FileSystemAdapter,
  dir: string,
  acc: ManifestEntry[],
): Promise<void> {
  const entries = await fs.readdir(dir)
  for (const e of entries) {
    if (isNotesTreeHidden(e)) continue
    if (e.isDirectory) {
      await listIndexableFiles(fs, e.path, acc)
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
    size,
    mtime,
  }
}

const BATCH = 25
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
export async function reconcileVaultSearchIndex(
  fs: FileSystemAdapter,
  isCancelled: () => boolean = () => false,
  run: ExtractRunner = extractInWorker,
): Promise<{ indexed: number; removed: number }> {
  const vault: ManifestEntry[] = []
  await listIndexableFiles(fs, '', vault)
  if (isCancelled()) return { indexed: 0, removed: 0 }

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

/** Incremental update for one file path after save. Routes by type. */
export async function reindexFilePath(
  fs: FileSystemAdapter,
  path: string,
  run: ExtractRunner = extractInWorker,
): Promise<void> {
  const doc = await fileToDocument(fs, path, undefined, run)
  if (doc) await upsertSearchDocument(doc)
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
