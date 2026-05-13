/**
 * Vault-scoped RAG (v1, MiniSearch-backed).
 *
 * The tier-1 "whole vault" chat surface needs to answer questions that span
 * every note/PDF in the vault — but pasting the whole vault into the model
 * is wasteful at best and impossible at scale. v1 reuses the existing
 * MiniSearch index (built at vault open in `lib/search/index.ts`) to find
 * the top-K most relevant documents for the user's prompt, then pulls an
 * excerpt around the best-matching region of each.
 *
 * This is deliberately *not* embedding-based. MiniSearch is already in the
 * bundle, the index is already warm, and lexical search is surprisingly
 * good at "what did I write about X?" queries that dominate PKM use. A
 * true embeddings path (Transformers.js or a vector service) is deferred —
 * see docs/LAUNCH_DEFERRALS.md.
 *
 * Tradeoffs accepted in v1:
 *   - Purely lexical: synonyms/paraphrase can miss relevant docs.
 *   - Canvas files are indexed by title only, so RAG excerpts won't pull
 *     from drawings.
 *   - Truncated — we cap both the per-doc excerpt length and the overall
 *     context so the prompt stays under `maxContextChars`.
 */

import { getSearchIndex } from '@/lib/search'
import { parseNote } from '@/lib/markdown'
import { loadPdfjs } from '@/lib/pdf/pdfjs-loader'
import type { FileSystemAdapter } from '@/lib/fs'
import type { SearchIndexDocument } from '@/types/search'
import type { ChatSettings } from '@/types/chat'

/** Default number of matches to pull in per query. */
export const DEFAULT_RAG_TOP_K = 6

/** Max per-doc excerpt in characters — keeps a single 200-page PDF from dominating. */
const PER_DOC_EXCERPT_CHARS = 3_000

/** Hard minimum so we never return an empty context for a matched doc. */
const MIN_EXCERPT_CHARS = 400

export interface VaultRagHit {
  path: string
  title: string
  type: 'markdown' | 'pdf' | 'canvas' | 'mindmap' | 'kanban' | 'spreadsheet' | 'pptx'
  score: number
  excerpt: string
}

export interface VaultContext {
  query: string
  hits: VaultRagHit[]
  /** Concatenated excerpts, ready to paste into a system prompt. */
  content: string
  /** True if we trimmed hits or excerpts to fit under the char budget. */
  truncated: boolean
  /** Fraction of the configured cap that ended up as content (0..1). */
  fillRatio: number
}

interface RawHit {
  id: string
  path: string
  title: string
  type: 'markdown' | 'pdf' | 'canvas' | 'mindmap' | 'kanban' | 'spreadsheet' | 'pptx'
  score: number
  content: string
  queryTerms: string[]
}

/** Run a MiniSearch query and coerce the raw results into a shape we can work with. */
function searchTopK(query: string, topK: number): RawHit[] {
  const index = getSearchIndex()
  const q = query.trim()
  if (!q) return []
  // `prefix: true` + `fuzzy: 0.2` is already the default on the shared index,
  // which gives us a useful recall floor for typo-ed queries.
  const raw = index.search(q).slice(0, topK)
  return raw.map((r) => {
    const doc = r as unknown as SearchIndexDocument
    return {
      id: String(r.id),
      path: doc.path,
      title: doc.title,
      type: doc.fileType,
      score: r.score,
      content: doc.content ?? '',
      queryTerms: r.queryTerms,
    }
  })
}

/**
 * Pick the window of `maxChars` that has the highest density of query-term
 * occurrences. The old approach (first-occurrence) breaks on documents that
 * list topics near the top (table-of-contents style): the first hit lands
 * in the TOC rather than the definition, so the model sees the wrong section.
 *
 * Algorithm:
 *  1. Collect every position where any query term occurs.
 *  2. For each candidate window starting at (pos - 30 % of window), count
 *     how many term positions fall inside it.
 *  3. Return the window with the highest count; ties go to the earlier one.
 */
function extractExcerpt(content: string, terms: string[], maxChars: number): string {
  if (content.length <= maxChars) return content
  const lower = content.toLowerCase()
  const lowerTerms = terms
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 2) // skip stop-word fragments

  if (lowerTerms.length === 0) return content.slice(0, maxChars)

  // Collect all term hit positions.
  const allHits: number[] = []
  for (const term of lowerTerms) {
    let idx = lower.indexOf(term)
    while (idx !== -1) {
      allHits.push(idx)
      idx = lower.indexOf(term, idx + 1)
    }
  }
  if (allHits.length === 0) return content.slice(0, maxChars)

  // Score each candidate window and track the best.
  const bias = Math.floor(maxChars * 0.3) // anchor each candidate slightly before the hit
  let bestStart = 0
  let bestScore = -1

  for (const hit of allHits) {
    const start = Math.max(0, hit - bias)
    const end = start + maxChars
    let score = 0
    for (const h of allHits) {
      if (h >= start && h < end) score++
    }
    if (score > bestScore) {
      bestScore = score
      bestStart = start
    }
  }

  const start = bestStart
  const end = Math.min(content.length, start + maxChars)
  const leftEllipsis = start > 0 ? '…' : ''
  const rightEllipsis = end < content.length ? '…' : ''
  return `${leftEllipsis}${content.slice(start, end)}${rightEllipsis}`
}

/**
 * Exported version of extractExcerpt for use by context-builder when the
 * document is too long and we need to find the most relevant slice.
 */
export { extractExcerpt as extractBestExcerpt }

/**
 * For PDFs the search index holds extracted text already, but older indexes
 * may predate the PDF indexer. Fall back to re-extracting from disk when
 * the stored content is empty.
 */
async function rehydrateIfEmpty(
  hit: RawHit,
  vaultFs: FileSystemAdapter,
): Promise<string> {
  if (hit.content.length > 0) return hit.content
  try {
    if (hit.type === 'markdown') {
      const raw = await vaultFs.readTextFile(hit.path)
      return parseNote(hit.path, raw).content ?? ''
    }
    if (hit.type === 'pdf') {
      const bytes = await vaultFs.readFile(hit.path)
      const pdfjs = await loadPdfjs()
      const doc = await pdfjs.getDocument({ data: bytes }).promise
      const chunks: string[] = []
      const pages = Math.min(doc.numPages, 30)
      for (let i = 1; i <= pages; i++) {
        const page = await doc.getPage(i)
        const tc = await page.getTextContent()
        chunks.push(
          tc.items
            .filter((it) => 'str' in it)
            .map((it) => (it as { str: string }).str)
            .join(' '),
        )
      }
      return chunks.join('\n\n')
    }
  } catch {
    /* fall through */
  }
  return ''
}

function fmtKind(type: VaultRagHit['type']): string {
  return type === 'markdown' ? 'note' : type
}

/**
 * Run the RAG pass. Returns a ready-to-embed context block plus the raw
 * hits so the UI can show "sources" chips if desired.
 */
export async function buildVaultContext(
  vaultFs: FileSystemAdapter,
  query: string,
  settings: ChatSettings,
  opts: { topK?: number } = {},
): Promise<VaultContext> {
  const topK = opts.topK ?? DEFAULT_RAG_TOP_K
  const maxChars = Math.max(1_000, settings.maxContextChars || 40_000)

  const raw = searchTopK(query, topK)
  if (raw.length === 0) {
    return {
      query,
      hits: [],
      content: '',
      truncated: false,
      fillRatio: 0,
    }
  }

  // Budget excerpts so the sum stays under `maxChars`. Give each hit at
  // least `MIN_EXCERPT_CHARS` if its share would otherwise shrink too far.
  const perDoc = Math.max(
    MIN_EXCERPT_CHARS,
    Math.min(PER_DOC_EXCERPT_CHARS, Math.floor(maxChars / raw.length)),
  )

  const hits: VaultRagHit[] = []
  let total = 0
  let truncated = false

  for (const r of raw) {
    const content = await rehydrateIfEmpty(r, vaultFs)
    const excerpt = extractExcerpt(content, r.queryTerms, perDoc)
    // Stop adding hits once we'd exceed the cap; never drop mid-excerpt.
    if (total + excerpt.length > maxChars) {
      truncated = true
      break
    }
    hits.push({
      path: r.path,
      title: r.title,
      type: r.type,
      score: r.score,
      excerpt,
    })
    total += excerpt.length
  }

  const body = hits
    .map(
      (h, i) =>
        `**Source ${i + 1}** · ${h.title} (${fmtKind(h.type)}) · \`${h.path}\`\n${h.excerpt}`,
    )
    .join('\n\n')

  return {
    query,
    hits,
    content: body,
    truncated,
    fillRatio: Math.min(1, total / maxChars),
  }
}

function vaultSystemPromptBase(): string {
  return [
    "You are an assistant embedded inside the user's personal notes app.",
    'Below you will find excerpts from the user\'s vault. Read ALL excerpts carefully and thoroughly before answering.',
    'Base your answer on the information found in these excerpts.',
    'Formatting rules (required): Start every section heading with Markdown ## or ### at the beginning of a line (never use only bold for headings). Leave one blank line before each heading and one blank line between paragraphs. Prefer short paragraphs rather than dense walls of text.',
    'Use **bold** for key terms inside sentences, unordered (-) lists when listing several related points, and avoid blockquotes (no lines starting with >). Between major sections you may insert a Markdown horizontal rule on its own line (`---`). Use at most two per reply.',
    'Do NOT add a "## Sources" section yourself — it is appended automatically.',
    'If none of the excerpts contain relevant information, say so briefly.',
    'Keep replies concise.',
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * Collect 1-based source indices cited in the body via `<sup>n</sup>` (any attributes).
 */
export function parseCitedSuperscriptIndices(bodyMarkdown: string): number[] {
  const cited = new Set<number>()
  const re = /<sup(?:\s[^>]*)?>\s*(\d+)\s*<\/sup>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(bodyMarkdown))) {
    const n = Number.parseInt(m[1], 10)
    if (n >= 1 && n <= 999) cited.add(n)
  }
  return [...cited].sort((a, b) => a - b)
}

/** Escape markdown link labels `[text](...)`. */
function escapeMarkdownLinkText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]')
}

function sourceListLabel(hit: VaultRagHit): string {
  const t = hit.title.trim()
  if (t) return t
  const parts = hit.path.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] ?? hit.path
}

function escapeHtmlText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Strip any model-produced Sources block (often malformed).
 * Append a row of chip links — one per RAG hit — using the vault path as label.
 */
export function mergeVaultSourcesSection(
  assistantMarkdown: string,
  hits: VaultRagHit[],
): string {
  if (hits.length === 0) return assistantMarkdown
  const base = assistantMarkdown
    .replace(/\n##\s+Sources\b[\s\S]*$/i, '')
    .replace(/\n+<div class="chat-sources">[\s\S]*?<\/div>/gi, '')
    .trimEnd()

  const chips = hits
    .map((h) => {
      const enc = encodeURI(h.path).replace(/"/g, '%22')
      const display = escapeHtmlText(h.path.replace(/\\/g, '/'))
      return `<a href="${enc}">${display}</a>`
    })
    .join('')

  return `${base}\n\n<div class="chat-sources">${chips}</div>\n`
}

export function buildVaultSystemMessage(
  context: VaultContext,
  settings: ChatSettings,
): string {
  const base =
    settings.systemPrompt?.trim() ||
    vaultSystemPromptBase()

  if (context.hits.length === 0) {
    return `${base}\n\n(No vault content matched the user's question — tell them you couldn't find anything relevant and ask them to rephrase.)`
  }

  const note = context.truncated
    ? '\nNote: only the top-matching excerpts are shown; more vault content may exist.'
    : ''

  return `${base}\n\n=== VAULT EXCERPTS (${context.hits.length} results) ===${note}\n\n${context.content}\n\n=== END EXCERPTS ===`
}
