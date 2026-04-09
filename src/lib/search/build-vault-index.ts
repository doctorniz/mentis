import type { FileSystemAdapter } from '@/lib/fs'
import type { FileEntry } from '@/types/files'
import { FileType } from '@/types/files'
import { isNotesTreeHidden } from '@/lib/notes/tree-filter'
import { extractTags, parseNote } from '@/lib/markdown'
import { loadPdfjs } from '@/lib/pdf/pdfjs-loader'
import type { NoteFrontmatter } from '@/types/editor'
import type { SearchIndexDocument } from '@/types/search'
import { replaceSearchIndex, upsertSearchDocument } from '@/lib/search/index'

function titleFromPath(path: string): string {
  return path.replace(/\.[^/.]+$/, '').split('/').pop() ?? path
}

function normalizeDocTags(fm: NoteFrontmatter, content: string): string[] {
  const fromBody = extractTags(content)
  const raw = fm.tags as unknown
  let fromFm: string[] = []
  if (Array.isArray(raw)) {
    fromFm = raw.map((x) => String(x).toLowerCase())
  } else if (typeof raw === 'string') {
    fromFm = raw
      .split(/[,\s]+/)
      .map((t) => t.replace(/^#/, '').toLowerCase())
      .filter(Boolean)
  }
  return [...new Set([...fromFm, ...fromBody])]
}

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
    } else if (
      e.type === FileType.Markdown ||
      e.type === FileType.Pdf ||
      e.type === FileType.Canvas
    ) {
      acc.push(e)
    }
  }
}

const CONTENT_CAP = 14_000

async function extractPdfText(data: Uint8Array): Promise<string> {
  try {
    const pdfjs = await loadPdfjs()
    const doc = await pdfjs.getDocument({ data }).promise
    const chunks: string[] = []
    let len = 0
    for (let i = 1; i <= doc.numPages && len < CONTENT_CAP; i++) {
      const page = await doc.getPage(i)
      const tc = await page.getTextContent()
      const pageText = tc.items
        .filter((it) => 'str' in it)
        .map((it) => (it as { str: string }).str)
        .join(' ')
      chunks.push(pageText)
      len += pageText.length
    }
    return chunks.join('\n')
  } catch {
    return ''
  }
}

async function fileTypeToDocument(
  fs: FileSystemAdapter,
  entry: FileEntry,
): Promise<SearchIndexDocument | null> {
  const path = entry.path
  const stat = await fs.stat(path).catch(() => null)
  const modifiedAt = stat?.modifiedAt.toISOString() ?? new Date(0).toISOString()

  if (entry.type === FileType.Markdown) {
    try {
      const raw = await fs.readTextFile(path)
      const doc = parseNote(path, raw)
      const title =
        (typeof doc.frontmatter.title === 'string' && doc.frontmatter.title) || titleFromPath(path)
      const tags = normalizeDocTags(doc.frontmatter, doc.content)
      const content = doc.content.length > CONTENT_CAP ? doc.content.slice(0, CONTENT_CAP) : doc.content
      const tagCsv = tags.join(',')
      const tagLine = tags.join(' ')
      return {
        id: path,
        path,
        title,
        fileType: 'markdown',
        content,
        tags: tagLine,
        tagCsv,
        modifiedAt,
      }
    } catch {
      return null
    }
  }

  if (entry.type === FileType.Pdf) {
    let content = ''
    let title = titleFromPath(path)
    try {
      const data = await fs.readFile(path)
      content = await extractPdfText(data)
      if (content.length > CONTENT_CAP) content = content.slice(0, CONTENT_CAP)

      const pdfjs = await loadPdfjs()
      const doc = await pdfjs.getDocument({ data }).promise
      const meta = await doc.getMetadata().catch(() => null)
      const infoTitle = (meta?.info as Record<string, unknown> | undefined)?.Title
      if (typeof infoTitle === 'string' && infoTitle.trim()) title = infoTitle.trim()
    } catch { /* use defaults */ }
    return {
      id: path,
      path,
      title,
      fileType: 'pdf',
      content,
      tags: '',
      tagCsv: '',
      modifiedAt,
    }
  }

  if (entry.type === FileType.Canvas) {
    return {
      id: path,
      path,
      title: titleFromPath(path),
      fileType: 'canvas',
      content: '',
      tags: '',
      tagCsv: '',
      modifiedAt,
    }
  }

  return null
}

/** Full vault scan and index replace (call on vault open). */
export async function rebuildVaultSearchIndex(fs: FileSystemAdapter): Promise<void> {
  const entries: FileEntry[] = []
  await collectIndexableFiles(fs, '', entries)
  const docs: SearchIndexDocument[] = []
  for (const e of entries) {
    const doc = await fileTypeToDocument(fs, e)
    if (doc) docs.push(doc)
  }
  replaceSearchIndex(docs)
}

/** Incremental update for one markdown path after save. */
export async function reindexMarkdownPath(fs: FileSystemAdapter, path: string): Promise<void> {
  const entry: FileEntry = {
    name: path.split('/').pop() ?? path,
    path,
    type: FileType.Markdown,
    isDirectory: false,
  }
  const doc = await fileTypeToDocument(fs, entry)
  if (doc) upsertSearchDocument(doc)
}
