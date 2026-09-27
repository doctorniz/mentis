import type { FileSystemAdapter } from '@/lib/fs'
import type { FileEntry } from '@/types/files'
import { isNotesTreeHidden } from '@/lib/notes/tree-filter'
import { fileTypes, titleForPath } from '@/core/registries'
import type { FileTypeDefinition, SearchExtraction } from '@/core/registries/file-types'
import type { SearchIndexDocument } from '@/types/search'
import { replaceSearchIndex, upsertSearchDocument } from '@/lib/search/index'

/**
 * Builds search documents from vault files. What a file contributes is its
 * module's business: each type with `search` support may supply a lazily
 * loaded extractor (so PDF.js, JSZip and SheetJS load only when a file of that
 * type is actually indexed). This file only walks the vault and assembles the
 * document.
 */

async function collectIndexableFiles(
  fs: FileSystemAdapter,
  dir: string,
  acc: FileEntry[],
): Promise<void> {
  const entries = await fs.readdir(dir)
  for (const e of entries) {
    if (isNotesTreeHidden(e)) continue
    if (e.isDirectory) {
      await collectIndexableFiles(fs, e.path, acc)
    } else if (fileTypes.resolve(e.path)?.search) {
      acc.push(e)
    }
  }
}

async function extractFor(
  def: FileTypeDefinition,
  fs: FileSystemAdapter,
  path: string,
): Promise<SearchExtraction | null> {
  const loader = def.search?.extract
  if (!loader) return { content: '' } // indexed by title only (e.g. drawings)
  try {
    const extract = (await loader()).default
    return await extract(fs, path)
  } catch {
    // Extractors handle their own read/parse failures; this covers a chunk that
    // failed to load. The file still appears in results by title.
    return { content: '' }
  }
}

async function fileToDocument(
  fs: FileSystemAdapter,
  path: string,
): Promise<SearchIndexDocument | null> {
  const def = fileTypes.resolve(path)
  if (!def?.search) return null

  const stat = await fs.stat(path).catch(() => null)
  const modifiedAt = stat?.modifiedAt.toISOString() ?? new Date(0).toISOString()

  const extracted = await extractFor(def, fs, path)
  if (!extracted) return null

  const tags = extracted.tags ?? []
  return {
    id: path,
    path,
    title: extracted.title || titleForPath(path),
    fileType: def.id,
    content: extracted.content,
    tags: tags.join(' '),
    tagCsv: tags.join(','),
    modifiedAt,
  }
}

/** Full vault scan and index replace (call on vault open). */
export async function rebuildVaultSearchIndex(fs: FileSystemAdapter): Promise<void> {
  const entries: FileEntry[] = []
  await collectIndexableFiles(fs, '', entries)
  const docs: SearchIndexDocument[] = []
  for (const e of entries) {
    const doc = await fileToDocument(fs, e.path)
    if (doc) docs.push(doc)
  }
  replaceSearchIndex(docs)
}

/** Incremental update for one file path after save. Routes by type. */
export async function reindexFilePath(fs: FileSystemAdapter, path: string): Promise<void> {
  const doc = await fileToDocument(fs, path)
  if (doc) upsertSearchDocument(doc)
}

/** @deprecated Use reindexFilePath instead. */
export async function reindexMarkdownPath(fs: FileSystemAdapter, path: string): Promise<void> {
  return reindexFilePath(fs, path)
}

/**
 * True for types cheap enough to reindex after a rename/move/save (text
 * formats). Heavy binary formats refresh on vault open or a manual rebuild.
 */
export function isIndexableTextPath(path: string): boolean {
  return fileTypes.resolve(path)?.search?.reindexOnSave === true
}
