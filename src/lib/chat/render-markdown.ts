/**
 * Minimal markdown renderer for chat messages.
 *
 * We can't reach for the full Tiptap pipeline (overkill for streaming
 * output) or `react-markdown` (not a dep). We also can't render LLM text
 * verbatim — users won't copy code blocks properly. So this module parses
 * with `marked` (already a dep) and sanitises the result with DOMPurify as
 * the last step. Model output is untrusted: vault chat feeds the user's
 * files to the model, so a prompt injection in any synced or imported
 * document can make it emit HTML.
 */

import { marked } from 'marked'
import { sanitizeHtml } from '@/lib/sanitize-html'

marked.setOptions({ gfm: true, breaks: true })

function isVaultPathLike(inner: string): boolean {
  const c = inner.trim()
  if (!c || c.includes(' — ') || c.length >= 160) return false
  if (c.startsWith('http://') || c.startsWith('https://')) return false
  return c.includes('/') || /\.(md|pdf|canvas|pptx)$/i.test(c)
}

function collectOrderedVaultPaths(markdown: string): string[] {
  const order: string[] = []
  const seen = new Set<string>()
  const re = /`([^`\n]{2,200})`/g
  let m: RegExpExecArray | null
  while ((m = re.exec(markdown))) {
    const p = m[1].trim()
    if (!isVaultPathLike(p)) continue
    if (!seen.has(p)) {
      seen.add(p)
      order.push(p)
    }
  }
  return order
}

/** Collapse runaway blank lines; keep `---` so answers can use subtle section dividers. */
function normalizeChatMarkdownBlanks(md: string): string {
  return md.replace(/\n{3,}/g, '\n\n')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;')
}

function hasSourcesBlock(md: string): boolean {
  return /^##\s+sources\b/im.test(md) || md.includes('<div class="chat-sources">')
}

function appendSourcesIfNeeded(md: string, paths: string[]): string {
  if (paths.length === 0) return md
  if (hasSourcesBlock(md)) return md

  const chips = paths
    .map((p) => {
      const enc = encodeURI(p).replace(/"/g, '%22')
      const display = p
        .replace(/\\/g, '/')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
      return `<a href="${enc}">${display}</a>`
    })
    .join('')

  return `${md}\n\n<div class="chat-sources">${chips}</div>\n`
}

/** Lines that are only `**Title**` become `## Title` (models often skip `#`). */
function promoteStandaloneBoldLinesToHeadings(md: string): string {
  return md.replace(/^\*\*([^*\n]+)\*\*\s*$/gm, '## $1')
}

/** Insert blank lines so block headings/lists parse as separate blocks. */
function normalizeMarkdownBlockSpacing(md: string): string {
  let out = md
  out = out.replace(/([^\n])\n(#+\s)/gm, '$1\n\n$2')
  out = out.replace(/([^\n])\n((?:[-+*]|\d+\.)\s)/gm, '$1\n\n$2')
  out = out.replace(/\n{3,}/g, '\n\n')
  return out
}

/** Normalize spacing. Sources section is stored with the message by mergeVaultSourcesSection. */
export function preprocessVaultChatMarkdown(
  markdown: string,
  authoritativeHitPaths?: string[],
): string {
  let md = normalizeChatMarkdownBlanks(markdown)
  md = promoteStandaloneBoldLinesToHeadings(md)
  md = normalizeMarkdownBlockSpacing(md)

  if (authoritativeHitPaths && authoritativeHitPaths.length > 0) {
    // Sources block already appended by mergeVaultSourcesSection at store time.
    return md
  }

  // Legacy threads that predate stored sources: collect any vault-path backticks
  // and append a sources list if one isn't already present.
  const paths = collectOrderedVaultPaths(md)
  if (paths.length === 0) return md
  md = appendSourcesIfNeeded(md, paths)
  return md
}

/** Append a Sources list when vault-path backticks are present in the response. */
export function preprocessChatMarkdown(markdown: string): string {
  let md = normalizeChatMarkdownBlanks(markdown)
  const paths = collectOrderedVaultPaths(md)
  if (paths.length === 0) return md
  md = appendSourcesIfNeeded(md, paths)
  return md
}

function isExternalOrSpecialHref(href: string): boolean {
  const h = href.trim()
  if (!h) return true
  const lower = h.toLowerCase()
  if (lower.startsWith('http://') || lower.startsWith('https://')) return true
  if (lower.startsWith('mailto:')) return true
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:'))
    return true
  if (h.startsWith('#')) return true
  if (h.startsWith('//')) return true
  if (/^[a-z]:[\\/]/i.test(h)) return true
  return false
}

function decodeHref(href: string): string {
  try {
    return decodeURIComponent(href.replace(/^\.\//, ''))
  } catch {
    return href.replace(/^\.\//, '')
  }
}

function rewriteVaultAnchors(html: string): string {
  return html.replace(/<a\s+([^>]*)>/gi, (_full, attrs: string) => {
    const hrefMatch = attrs.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)')/i)
    if (!hrefMatch) return `<a ${attrs}>`
    const href = hrefMatch[2] ?? hrefMatch[3] ?? ''
    const path = decodeHref(href)
    if (isExternalOrSpecialHref(path)) return `<a ${attrs}>`
    if (!isVaultPathLike(path)) return `<a ${attrs}>`

    const without = attrs
      .replace(/\bhref\s*=\s*("[^"]*"|'[^']*')/i, '')
      .replace(/\s*\btarget\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\s*\brel\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .trim()
    const rest = without ? ` ${without}` : ''
    return `<a href="#" role="link" class="chat-vault-source" title="Open in Vault"${rest} data-ink-path="${escapeAttr(path)}">`
  })
}

export function renderChatMarkdown(markdown: string): string {
  if (!markdown) return ''
  try {
    const pre = preprocessChatMarkdown(markdown)
    const html = String(marked.parse(pre, { async: false }))
    return sanitizeHtml(rewriteVaultAnchors(html), { linksInNewTab: true })
  } catch {
    // Fallback: plain-text with HTML-escaping and paragraph breaks, so a
    // malformed markdown chunk never blocks the whole response.
    const escaped = markdown.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return `<p>${escaped.replace(/\n/g, '<br/>')}</p>`
  }
}

/** Whole-vault chat: cite ↔ source order matches RAG hits; canonical Sources use encodeURI. */
export function renderVaultChatMarkdown(markdown: string, vaultRagHitPaths?: string[]): string {
  if (!markdown) return ''
  try {
    const pre = preprocessVaultChatMarkdown(markdown, vaultRagHitPaths)
    const html = String(marked.parse(pre, { async: false }))
    return sanitizeHtml(rewriteVaultAnchors(html), { linksInNewTab: true })
  } catch {
    const escaped = markdown.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return `<p>${escaped.replace(/\n/g, '<br/>')}</p>`
  }
}
