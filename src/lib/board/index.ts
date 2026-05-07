import matter from 'gray-matter'
import type { BoardItem, BoardItemFrontmatter, ThoughtColor } from '@/types/board'

export const BOARD_DIR = '_marrow/_board'
export const BOARD_ASSETS_DIR = '_marrow/_board/_assets'

const H1_RE = /^#\s+(.+)$/m
const IMAGE_RE = /!\[.*?\]\(.+?\)/

export function parseBoardItem(path: string, raw: string): BoardItem {
  const { data, content } = matter(raw)
  const fm = data as Partial<BoardItemFrontmatter>
  const h1 = H1_RE.exec(content)

  return {
    path,
    type: (fm.type as BoardItem['type']) ?? 'thought',
    title: h1 ? h1[1].trim() : null,
    body: content,
    color: (fm.color as ThoughtColor) ?? 'yellow',
    created: fm.created ?? new Date().toISOString(),
    modified: fm.modified ?? new Date().toISOString(),
    hasImage: IMAGE_RE.test(content),
    audioPath: (fm.audioPath as string) ?? null,
    audioDuration: typeof fm.audioDuration === 'number' ? fm.audioDuration : null,
    transcript: (fm.transcript as string) ?? null,
  }
}

export function serializeBoardItem(
  fm: BoardItemFrontmatter,
  content: string,
): string {
  const updated = { ...fm, modified: new Date().toISOString() }
  return matter.stringify(content, updated)
}

export function generateBoardFilename(): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `${ts}-${rand}.md`
}

export function defaultFrontmatter(color: ThoughtColor = 'yellow'): BoardItemFrontmatter {
  const now = new Date().toISOString()
  return { type: 'thought', created: now, modified: now, color }
}

/**
 * Strip `![](...)` from board markdown — used when editing cards and when
 * deciding if a card is image-only during Move to Vault.
 */
export function stripBoardImageMarkdown(body: string): { stripped: string; imageLines: string[] } {
  const imageLines: string[] = []
  const stripped = body
    .replace(/!\[[^\]]*\]\([^)]+\)/g, (match) => {
      imageLines.push(match)
      return ''
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { stripped, imageLines }
}

/** Paths from `![](path)` excluding http(s) and blob URLs. */
export function extractBoardVaultImagePaths(body: string): string[] {
  const paths: string[] = []
  for (const match of body.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
    const src = match[1]
    if (
      src.startsWith('http://') ||
      src.startsWith('https://') ||
      src.startsWith('blob:')
    ) {
      continue
    }
    paths.push(src)
  }
  return paths
}

/**
 * Image-only cards: headings + blanks only after removing embedded images —
 * qualifies for exporting a single raster file instead of markdown.
 */
export function boardBodyIsImageOnly(body: string): boolean {
  const { stripped } = stripBoardImageMarkdown(body)
  const withoutHeadings = stripped.replace(/^#{1,6}\s[^\n]*(?:\n|$)/gm, '').trim()
  return withoutHeadings.length === 0
}

function sanitizeStemForFilename(raw: string): string {
  return raw.replace(/[/\\:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim()
}

/** Vault-root filename: prefer sanitized H1 title; else stem of `fallbackFilename`. */
export function boardExportBasenamePreferTitle(
  title: string | null,
  fallbackFilename: string,
  extWithDot: string,
): string {
  const ext = extWithDot.startsWith('.') ? extWithDot : `.${extWithDot}`
  const fromTitle = title ? sanitizeStemForFilename(title) : ''
  if (fromTitle) return `${fromTitle}${ext}`
  const base = fallbackFilename.split('/').pop() ?? 'file'
  const stem = sanitizeStemForFilename(base.replace(/\.[^.]+$/i, '')) || 'file'
  return `${stem}${ext}`
}
