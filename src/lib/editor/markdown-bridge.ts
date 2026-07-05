import { generateHTML, generateJSON } from '@tiptap/html'
import { marked } from 'marked'
import TurndownService from 'turndown'
import type { JSONContent } from '@tiptap/core'
import { getNoteEditorExtensions } from '@/lib/editor/tiptap-extensions'

const extensions = getNoteEditorExtensions()

marked.setOptions({ gfm: true, breaks: true })

const PDF_EMBED_RE = /!\[\[([^\]]+\.pdf)#page=(\d+(?:-\d+)?)\]\]/g
const VIDEO_EMBED_RE = /!\[\[([^\]]+\.(mp4|webm|ogg|mov|mkv|avi))\]\]/gi
const WIKI_IN_MD_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g
const MATH_BLOCK_RE = /\$\$([\s\S]+?)\$\$/g
// Pandoc-style inline math: opening `$` must be followed by a non-space,
// non-`$` char; closing `$` must be preceded by a non-space char and not
// followed by a digit. Keeps plain-text dollar amounts ("$5 and $10") from
// being misread as a math span.
const MATH_INLINE_RE = /\$(?!\s|\$)([^$\n]+?)(?<!\s)\$(?!\d)/g
const HIGHLIGHT_RE = /==([^=\n]+?)==/g
const CODE_FENCE_RE = /^([ \t]{0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\1\2[ \t]*$/gm
const CODE_SPAN_RE = /(`+)([\s\S]*?)\1(?!`)/g
const SHIELD_RE = /\0(?:CODEBLOCK|CODESPAN)(\d+)\0/g

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Replace fenced code blocks and inline code spans with opaque placeholder
 * tokens so the custom-syntax passes below (math, wiki-links, embeds, task
 * lists) never rewrite text that's meant to be literal code — e.g. `$PATH`
 * or a `[[not a link]]` example inside a snippet. Restored verbatim right
 * before handing off to `marked`.
 */
function shieldCodeRegions(md: string): { shielded: string; restore: (s: string) => string } {
  const placeholders: string[] = []
  const store = (text: string, tag: string) => {
    const idx = placeholders.push(text) - 1
    return `\0${tag}${idx}\0`
  }

  let shielded = md.replace(CODE_FENCE_RE, (match) => store(match, 'CODEBLOCK'))
  // Only literal backticks remain once fenced blocks are shielded, so any
  // backtick-delimited span left is an inline code span.
  shielded = shielded.replace(CODE_SPAN_RE, (match) => store(match, 'CODESPAN'))

  return {
    shielded,
    restore: (s) => s.replace(SHIELD_RE, (_, i) => placeholders[Number(i)] ?? ''),
  }
}

type TaskNode = { checked: boolean; content: string; children: TaskNode[] }

/** Stack-based indent tree so nested task items (`  - [ ] child`) nest correctly. */
function buildTaskTree(items: { indent: number; checked: boolean; content: string }[]): TaskNode[] {
  const root: TaskNode[] = []
  const stack: { indent: number; children: TaskNode[] }[] = [{ indent: -1, children: root }]

  for (const item of items) {
    while (stack.length > 1 && item.indent <= stack[stack.length - 1]!.indent) {
      stack.pop()
    }
    const node: TaskNode = { checked: item.checked, content: item.content, children: [] }
    stack[stack.length - 1]!.children.push(node)
    stack.push({ indent: item.indent, children: node.children })
  }
  return root
}

function serializeTaskTree(nodes: TaskNode[]): string {
  const lis = nodes.map((n) => {
    const childHtml = n.children.length > 0 ? serializeTaskTree(n.children) : ''
    return `<li data-type="taskItem" data-checked="${n.checked}"><p>${n.content}</p>${childHtml}</li>`
  })
  return `<ul data-type="taskList">${lis.join('')}</ul>`
}

/**
 * Collect contiguous runs of task-list items and wrap them in nested
 * `<ul data-type="taskList">` / `<li data-type="taskItem">` matching each
 * line's indentation. Non-task lines flush the current task block.
 */
function preprocessTaskLists(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let taskBuf: { indent: number; checked: boolean; content: string }[] = []

  function flushTasks() {
    if (taskBuf.length === 0) return
    out.push(serializeTaskTree(buildTaskTree(taskBuf)))
    taskBuf = []
  }

  for (const line of lines) {
    const m = line.match(/^([ \t]*)-\s+\[([ xX])\]\s+(.*)$/)
    if (m) {
      taskBuf.push({
        indent: m[1]!.length,
        checked: m[2] !== ' ',
        content: m[3]!,
      })
    } else {
      flushTasks()
      out.push(line)
    }
  }
  flushTasks()
  return out.join('\n')
}

function preprocessCustomSyntax(md: string): string {
  const { shielded, restore } = shieldCodeRegions(md)
  let out = shielded

  out = preprocessTaskLists(out)

  out = out.replace(MATH_BLOCK_RE, (_, latex) => {
    const l = String(latex).trim()
    return `<div data-type="math-block" data-latex="${esc(l)}">$$${esc(l)}$$</div>`
  })

  out = out.replace(MATH_INLINE_RE, (_, latex) => {
    const l = String(latex).trim()
    return `<span data-type="math-inline" data-latex="${esc(l)}">$${esc(l)}$</span>`
  })

  out = out.replace(HIGHLIGHT_RE, (_, text) => `<mark>${esc(String(text).trim())}</mark>`)

  out = out.replace(VIDEO_EMBED_RE, (_, file) => {
    const f = String(file).trim()
    return `<div data-type="vault-video" data-src="${esc(f)}" data-title="${esc(f)}"></div>`
  })

  out = out.replace(PDF_EMBED_RE, (_, file, page) => {
    const f = String(file).trim()
    const p = String(page).trim()
    return `<div data-type="pdf-embed" data-file="${esc(f)}" data-page="${esc(p)}">![[${esc(f)}#page=${esc(p)}]]</div>`
  })

  out = out.replace(WIKI_IN_MD_RE, (_, target, alias) => {
    const t = String(target).trim()
    const display = String(alias ?? target).trim()
    return `<span data-type="wiki-link" data-target="${esc(t)}" data-label="${esc(display)}">${display}</span>`
  })

  return restore(out)
}

function createTurndown(): TurndownService {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
  })
  td.addRule('listItem', {
    filter: 'li',
    replacement(content, node, options) {
      const parent = node.parentNode as HTMLElement
      let prefix: string
      if (parent.nodeName === 'OL') {
        const start = parent.getAttribute('start')
        const idx = Array.prototype.indexOf.call(parent.children, node) as number
        prefix = `${start ? Number(start) + idx : idx + 1}. `
      } else {
        prefix = `${options.bulletListMarker} `
      }
      const isParagraph = /\n$/.test(content)
      const trimmed = content.replace(/^\n+/, '').replace(/\n+$/, '') + (isParagraph ? '\n' : '')
      const indented = trimmed.replace(/\n/gm, '\n' + ' '.repeat(prefix.length))
      return prefix + indented + ((node as HTMLElement).nextSibling ? '\n' : '')
    },
  })

  td.addRule('tableCell', {
    filter: ['th', 'td'],
    replacement(content, node) {
      const trimmed = content.replace(/\n/g, ' ').trim()
      const el = node as HTMLElement
      const isLast = !el.nextElementSibling
      return isLast ? ` ${trimmed} |` : ` ${trimmed} |`
    },
  })

  td.addRule('tableRow', {
    filter: 'tr',
    replacement(content, node) {
      const el = node as HTMLElement
      let row = `|${content}\n`
      const parent = el.parentNode as HTMLElement | null
      if (
        parent?.nodeName === 'THEAD' ||
        (!el.previousElementSibling &&
          parent?.nodeName === 'TBODY' &&
          !(parent.previousElementSibling?.nodeName === 'THEAD'))
      ) {
        const cells = el.querySelectorAll('th, td')
        const sep = Array.from(cells)
          .map(() => ' --- ')
          .join('|')
        row += `|${sep}|\n`
      }
      return row
    },
  })

  td.addRule('table', {
    filter: 'table',
    replacement(content) {
      return `\n${content}\n`
    },
  })

  td.addRule('taskItem', {
    filter(node) {
      return (
        node.nodeName === 'LI' && (node as HTMLElement).getAttribute('data-type') === 'taskItem'
      )
    },
    replacement(content, node) {
      const el = node as HTMLElement
      const raw = el.getAttribute('data-checked')
      const checked = raw !== null && raw !== 'false'
      const trimmed = content
        .replace(/^\n+/, '')
        .replace(/\n+$/, '')
        // Turndown inserts a blank line between this item's text and a
        // nested taskList; collapsing it avoids an indented blank line
        // that would end the list on re-parse instead of nesting it.
        .replace(/\n{2,}(?=-\s\[[ xX]\])/g, '\n')
      // 2-space indent for any nested taskList markdown this item contains,
      // so `child` items stay nested under `parent` on save.
      const indented = trimmed.replace(/\n/g, '\n  ')
      return `${checked ? '- [x]' : '- [ ]'} ${indented}\n`
    },
  })

  td.addRule('taskList', {
    filter(node) {
      return (
        node.nodeName === 'UL' && (node as HTMLElement).getAttribute('data-type') === 'taskList'
      )
    },
    replacement(content, node) {
      const parent = (node as HTMLElement).parentNode as HTMLElement | null
      const nested = parent?.getAttribute?.('data-type') === 'taskItem'
      return nested ? `\n${content}` : `\n${content}\n`
    },
  })

  td.addRule('highlight', {
    filter: 'mark',
    replacement(content) {
      return `==${content}==`
    },
  })

  td.addRule('mathInline', {
    filter(node) {
      return (
        node.nodeName === 'SPAN' &&
        (node as HTMLElement).getAttribute('data-type') === 'math-inline'
      )
    },
    replacement(_content, node) {
      const latex = (node as HTMLElement).getAttribute('data-latex') ?? ''
      return latex ? `$${latex}$` : _content
    },
  })

  td.addRule('mathBlock', {
    filter(node) {
      return (
        node.nodeName === 'DIV' && (node as HTMLElement).getAttribute('data-type') === 'math-block'
      )
    },
    replacement(_content, node) {
      const latex = (node as HTMLElement).getAttribute('data-latex') ?? ''
      return latex ? `\n$$${latex}$$\n` : _content
    },
  })

  td.addRule('pdfEmbed', {
    filter(node) {
      return (
        node.nodeName === 'DIV' && (node as HTMLElement).getAttribute('data-type') === 'pdf-embed'
      )
    },
    replacement(_content, node) {
      const el = node as HTMLElement
      const file = el.getAttribute('data-file') ?? ''
      const page = el.getAttribute('data-page') ?? '1'
      return file ? `\n![[${file}#page=${page}]]\n` : _content
    },
  })

  td.addRule('vaultVideo', {
    filter(node) {
      return (
        node.nodeName === 'DIV' && (node as HTMLElement).getAttribute('data-type') === 'vault-video'
      )
    },
    replacement(_content, node) {
      const src = (node as HTMLElement).getAttribute('data-src') ?? ''
      return src ? `\n![[${src}]]\n` : _content
    },
  })

  td.addRule('inkWikiLink', {
    filter(node) {
      return (
        node.nodeName === 'SPAN' && (node as HTMLElement).getAttribute('data-type') === 'wiki-link'
      )
    },
    replacement(_content, node) {
      const el = node as HTMLElement
      const target = el.getAttribute('data-target')?.trim() ?? ''
      const label = el.getAttribute('data-label')?.trim() ?? target
      if (!target) return _content
      return label !== target ? `[[${target}|${label}]]` : `[[${target}]]`
    },
  })
  return td
}

export function markdownToTiptapJSON(markdown: string): JSONContent {
  const src = markdown.trim() || ''
  const preprocessed = preprocessCustomSyntax(src)
  const html = preprocessed ? String(marked.parse(preprocessed, { async: false })) : ''
  const wrapped = html || '<p></p>'
  return generateJSON(wrapped, extensions)
}

export function tiptapJSONToMarkdown(doc: JSONContent): string {
  const html = generateHTML(doc, extensions)
  return createTurndown().turndown(html).trim()
}
