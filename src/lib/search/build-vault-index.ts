import type { FileSystemAdapter } from '@/lib/fs'
import type { FileEntry } from '@/types/files'
import { FileType, getFileType } from '@/types/files'
import { isNotesTreeHidden } from '@/lib/notes/tree-filter'
import { extractTags, parseNote } from '@/lib/markdown'
import { loadPdfjs } from '@/lib/pdf/pdfjs-loader'
import { extractXlsxText } from '@/lib/spreadsheet/xlsx-io'
import { parseMindmap, extractMindmapText } from '@/lib/mindmap'
import { parseKanban } from '@/lib/kanban'
import type { NoteFrontmatter } from '@/types/editor'
import type { SearchIndexDocument } from '@/types/search'
import { replaceSearchIndex, upsertSearchDocument } from '@/lib/search/index'

function titleFromPath(path: string): string {
  return (
    path
      .replace(/\.[^/.]+$/, '')
      .split('/')
      .pop() ?? path
  )
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
      e.type === FileType.Canvas ||
      e.type === FileType.Mindmap ||
      e.type === FileType.Kanban ||
      e.type === FileType.Pptx ||
      e.type === FileType.Spreadsheet ||
      e.type === FileType.Docx ||
      e.type === FileType.Code
    ) {
      acc.push(e)
    }
  }
}

const CONTENT_CAP = 14_000

/**
 * Extract text from a PPTX file by parsing the Open XML slide XML.
 * Uses JSZip to read the ZIP-compressed .pptx and pulls text from
 * `<a:t>` tags in each slide's XML. Lightweight — no SlideCanvas import
 * needed, so this works in the search index builder without pulling
 * the full editor bundle.
 */
async function extractPptxText(data: Uint8Array): Promise<string> {
  try {
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(data)
    const chunks: string[] = []
    let len = 0

    // Slides live at ppt/slide1.xml, ppt/slide2.xml, etc.
    const slideFiles = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
      .sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)/i)?.[1] ?? '0', 10)
        const numB = parseInt(b.match(/slide(\d+)/i)?.[1] ?? '0', 10)
        return numA - numB
      })

    for (const fileName of slideFiles) {
      if (len >= CONTENT_CAP) break
      const xml = await zip.files[fileName].async('text')
      // Extract all <a:t>...</a:t> text runs
      const textRuns = xml.match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g) ?? []
      const slideText = textRuns.map((tag) => tag.replace(/<[^>]+>/g, '')).join(' ')
      if (slideText.trim()) {
        chunks.push(slideText.trim())
        len += slideText.length
      }
    }
    return chunks.join('\n')
  } catch {
    return ''
  }
}

/**
 * Extract text from a DOCX file by parsing the Open XML document body.
 * Same lightweight approach as `extractPptxText`: JSZip + regex over
 * `<w:t>` text runs, with `</w:p>` paragraph ends becoming newlines —
 * no need to pull the full DOCX editor bundle into the index builder.
 * Exported for tests.
 */
export async function extractDocxText(data: Uint8Array): Promise<string> {
  try {
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(data)
    const docXml = zip.files['word/document.xml']
    if (!docXml) return ''
    const xml = await docXml.async('text')

    const paragraphs = xml.split(/<\/w:p>/)
    const chunks: string[] = []
    let len = 0
    for (const para of paragraphs) {
      if (len >= CONTENT_CAP) break
      const textRuns = para.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) ?? []
      const text = textRuns
        .map((tag) => tag.replace(/<[^>]+>/g, ''))
        .join('')
        .trim()
      if (text) {
        chunks.push(text)
        len += text.length
      }
    }
    return chunks.join('\n')
  } catch {
    return ''
  }
}

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
      const content =
        doc.content.length > CONTENT_CAP ? doc.content.slice(0, CONTENT_CAP) : doc.content
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
    } catch {
      /* use defaults */
    }
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

  if (entry.type === FileType.Mindmap) {
    let content = ''
    try {
      const raw = await fs.readTextFile(path)
      content = extractMindmapText(parseMindmap(raw))
    } catch {
      /* use empty */
    }
    return {
      id: path,
      path,
      title: titleFromPath(path),
      fileType: 'mindmap',
      content,
      tags: '',
      tagCsv: '',
      modifiedAt,
    }
  }

  if (entry.type === FileType.Kanban) {
    let content = ''
    try {
      const raw = await fs.readTextFile(path)
      const { board } = parseKanban(raw)
      content = board.columns
        .flatMap((col) => [col.heading, ...col.cards.map((c) => c.title)])
        .join('\n')
    } catch {
      /* use empty */
    }
    return {
      id: path,
      path,
      title: titleFromPath(path),
      fileType: 'kanban',
      content,
      tags: '',
      tagCsv: '',
      modifiedAt,
    }
  }

  if (entry.type === FileType.Pptx) {
    let content = ''
    try {
      const data = await fs.readFile(path)
      content = await extractPptxText(data)
    } catch {
      /* use empty */
    }
    return {
      id: path,
      path,
      title: titleFromPath(path),
      fileType: 'pptx',
      content,
      tags: '',
      tagCsv: '',
      modifiedAt,
    }
  }

  if (entry.type === FileType.Spreadsheet) {
    let content = ''
    try {
      const data = await fs.readFile(path)
      content = extractXlsxText(data)
    } catch {
      /* use empty */
    }
    return {
      id: path,
      path,
      title: titleFromPath(path),
      fileType: 'spreadsheet',
      content,
      tags: '',
      tagCsv: '',
      modifiedAt,
    }
  }

  if (entry.type === FileType.Docx) {
    let content = ''
    try {
      const data = await fs.readFile(path)
      content = await extractDocxText(data)
      if (content.length > CONTENT_CAP) content = content.slice(0, CONTENT_CAP)
    } catch {
      /* use empty */
    }
    return {
      id: path,
      path,
      title: titleFromPath(path),
      fileType: 'docx',
      content,
      tags: '',
      tagCsv: '',
      modifiedAt,
    }
  }

  if (entry.type === FileType.Code) {
    let content = ''
    try {
      content = await fs.readTextFile(path)
      if (content.length > CONTENT_CAP) content = content.slice(0, CONTENT_CAP)
    } catch {
      /* use empty */
    }
    return {
      id: path,
      path,
      // Keep the extension in the title — `notes.ts` and `notes.py` must
      // stay distinguishable in results (titleFromPath would strip it).
      title: path.split('/').pop() ?? path,
      fileType: 'code',
      content,
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

/** Incremental update for one file path after save. Routes by extension. */
export async function reindexFilePath(fs: FileSystemAdapter, path: string): Promise<void> {
  const name = path.split('/').pop() ?? path
  const type = getFileType(name)
  const entry: FileEntry = { name, path, type, isDirectory: false }
  const doc = await fileTypeToDocument(fs, entry)
  if (doc) upsertSearchDocument(doc)
}

/** @deprecated Use reindexFilePath instead. */
export async function reindexMarkdownPath(fs: FileSystemAdapter, path: string): Promise<void> {
  return reindexFilePath(fs, path)
}

/**
 * True for text-based file types that are cheap to reindex after a
 * rename/move/save. Binary types (PDF, PPTX, XLSX, DOCX) are deliberately
 * excluded — their extraction is heavy, so they refresh on vault open or
 * a manual index rebuild instead.
 */
export function isIndexableTextPath(path: string): boolean {
  const type = getFileType(path.split('/').pop() ?? path)
  return (
    type === FileType.Markdown ||
    type === FileType.Kanban ||
    type === FileType.Mindmap ||
    type === FileType.Code
  )
}
