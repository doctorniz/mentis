/**
 * Document-scoped context builder.
 *
 * Pulls the current document's text, caps it, and bakes a system prompt
 * that instructs the model to answer *only* from that content. The text comes
 * from the file type's search extractor, run in the extract worker, so every
 * type with one (notes, PDFs, Office files, decks, boards, code…) gives chat
 * the same text search sees, and parsing never blocks the UI. Types without
 * an extractor (drawings, images) give their title only.
 */

import { fileTypes, titleForPath } from '@/core/registries'
import { extractInWorker } from '@/core/index/extract-client'
import type { ExtractRunner } from '@/core/index/extract'
import { extractBestExcerpt } from '@/lib/chat/vault-rag'
import type { FileSystemAdapter } from '@/lib/fs'
import type { ChatSettings } from '@/types/chat'

/**
 * Trim content at a hard char cap with an explanatory footer so the
 * model doesn't assume it's seeing the whole document.
 */
function cap(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content
  const head = content.slice(0, maxChars)
  return `${head}\n\n[... document truncated at ${maxChars.toLocaleString()} characters ...]`
}

export interface DocumentContext {
  path: string
  title: string
  /** 'markdown' | 'pdf' | 'other' — drives prompt phrasing. */
  kind: 'markdown' | 'pdf' | 'other'
  /** The file type's label (e.g. "Word document"), for 'other'. */
  typeLabel?: string
  content: string
  /** True if content was sliced below the full document length. */
  truncated: boolean
  /** Fraction of the configured cap that ended up as content (0..1). */
  fillRatio: number
}

/**
 * Tokenise a plain-text query into searchable terms (3+ char words, lowercased).
 * Mirrors what MiniSearch would extract so `extractBestExcerpt` can find the
 * same regions the search index scores highest.
 */
function queryToTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2)
}

/**
 * Smart-cap: if the body is within budget return it as-is; otherwise use
 * `extractBestExcerpt` to pick the window most relevant to the user's query
 * (highest density of query-term hits). Falls back to head-truncation when no
 * query is provided, preserving the previous behaviour for large-context models.
 */
function smartCap(body: string, maxChars: number, query?: string): string {
  if (body.length <= maxChars) return body
  if (!query) return cap(body, maxChars)
  const terms = queryToTerms(query)
  if (terms.length === 0) return cap(body, maxChars)
  return extractBestExcerpt(body, terms, maxChars)
}

interface Extracted {
  path: string
  size: number
  mtime: number
  title?: string
  content: string
}

/** The last document extracted: a chat about one file re-reads it only when it changes. */
let lastExtracted: Extracted | null = null

async function extractDocument(
  vaultFs: FileSystemAdapter,
  path: string,
  run: ExtractRunner,
): Promise<{ title?: string; content: string }> {
  const def = fileTypes.resolve(path)
  const read = def?.search?.read
  if (!def || !read) return { content: '' }

  const stat = await vaultFs.stat(path).catch(() => null)
  const size = stat?.size ?? -1
  const mtime = stat?.modifiedAt.getTime() ?? -1
  const hit = lastExtracted
  if (stat && hit && hit.path === path && hit.size === size && hit.mtime === mtime) return hit

  const data = read === 'text' ? await vaultFs.readTextFile(path) : await vaultFs.readFile(path)
  const result = await run({ typeId: def.id, path, data })
  const extracted = { path, size, mtime, title: result?.title, content: result?.content ?? '' }
  if (stat) lastExtracted = extracted
  return extracted
}

export async function buildDocumentContext(
  vaultFs: FileSystemAdapter,
  path: string,
  settings: ChatSettings,
  /** Current user query — used to extract the most relevant slice when the
   *  document is too long to fit in the context window. */
  query?: string,
  run: ExtractRunner = extractInWorker,
): Promise<DocumentContext> {
  const def = fileTypes.resolve(path)
  const kind = def?.id === 'markdown' ? 'markdown' : def?.id === 'pdf' ? 'pdf' : 'other'
  const maxChars = Math.max(1_000, settings.maxContextChars || 40_000)
  const base = { path, kind, typeLabel: def?.label } as const

  let extracted: { title?: string; content: string }
  try {
    extracted = await extractDocument(vaultFs, path, run)
  } catch {
    extracted = { content: '' }
  }
  const title = extracted.title || titleForPath(path)
  const body = extracted.content
  const capped = smartCap(body, maxChars, query)
  return {
    ...base,
    title,
    content: capped,
    truncated: capped.length < body.length,
    fillRatio: Math.min(1, capped.length / maxChars),
  }
}

const DEFAULT_SYSTEM_PROMPT = [
  "You are an assistant embedded inside the user's personal notes app.",
  'Answer strictly from the document content provided in this message.',
  'If the answer is not present, say so briefly instead of guessing.',
  'Formatting: use ## or ### headings, blank lines between sections (no --- horizontal rules), **bold** for key terms, unordered (-) lists for lists. Do not use blockquotes. Keep replies concise; cite the document path in backticks when you quote or paraphrase a specific passage.',
].join(' ')

/** Compose the `system` message sent with every chat request. */
export function buildSystemMessage(context: DocumentContext, settings: ChatSettings): string {
  const base = settings.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT
  const header =
    context.kind === 'pdf'
      ? `The user is viewing a PDF titled "${context.title}".`
      : context.kind === 'markdown'
        ? `The user is viewing a markdown note titled "${context.title}".`
        : `The user is viewing a file titled "${context.title}"${context.typeLabel ? ` (${context.typeLabel})` : ''}.`

  const note = context.truncated
    ? ' The content below has been truncated — mention this if the answer might be in a later section.'
    : ''

  const body = context.content
    ? `\n\n<document path="${context.path}">\n${context.content}\n</document>`
    : `\n\n(No readable text content was available from this document.)`

  return `${base}\n\n${header}${note}${body}`
}
