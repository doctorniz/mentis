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
const MATH_INLINE_RE = /(?<!\$)\$(?!\$)(.+?)\$(?!\$)/g

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/**
 * Collect contiguous runs of task-list items and wrap them in
 * `<ul data-type="taskList">` with `<li data-type="taskItem" data-checked>`.
 * Non-task lines flush the current task block.
 */
function preprocessTaskLists(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let taskBuf: string[] = []

  function flushTasks() {
    if (taskBuf.length === 0) return
    out.push('<ul data-type="taskList">')
    for (const t of taskBuf) out.push(t)
    out.push('</ul>')
    taskBuf = []
  }

  for (const line of lines) {
    const m = line.match(/^([ \t]*)-\s+\[([ xX])\]\s+(.*)$/)
    if (m) {
      const checked = m[2] !== ' ' ? 'true' : 'false'
      const content = m[3]
      taskBuf.push(`<li data-type="taskItem" data-checked="${checked}"><p>${content}</p></li>`)
    } else {
      flushTasks()
      out.push(line)
    }
  }
  flushTasks()
  return out.join('\n')
}

function preprocessCustomSyntax(md: string): string {
  let out = md

  out = preprocessTaskLists(out)

  out = out.replace(MATH_BLOCK_RE, (_, latex) => {
    const l = String(latex).trim()
    return `<div data-type="math-block" data-latex="${esc(l)}">$$${esc(l)}$$</div>`
  })

  out = out.replace(MATH_INLINE_RE, (_, latex) => {
    const l = String(latex).trim()
    return `<span data-type="math-inline" data-latex="${esc(l)}">$${esc(l)}$</span>`
  })

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

  return out
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
        (!el.previousElementSibling && parent?.nodeName === 'TBODY' &&
          !(parent.previousElementSibling?.nodeName === 'THEAD'))
      ) {
        const cells = el.querySelectorAll('th, td')
        const sep = Array.from(cells).map(() => ' --- ').join('|')
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
        node.nodeName === 'LI' &&
        (node as HTMLElement).getAttribute('data-type') === 'taskItem'
      )
    },
    replacement(content, node) {
      const el = node as HTMLElement
      const raw = el.getAttribute('data-checked')
      const checked = raw !== null && raw !== 'false'
      const text = content.replace(/^\n+/, '').replace(/\n+$/, '')
      return `${checked ? '- [x]' : '- [ ]'} ${text}\n`
    },
  })

  td.addRule('taskList', {
    filter(node) {
      return (
        node.nodeName === 'UL' &&
        (node as HTMLElement).getAttribute('data-type') === 'taskList'
      )
    },
    replacement(content) {
      return `\n${content}\n`
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
        node.nodeName === 'DIV' &&
        (node as HTMLElement).getAttribute('data-type') === 'math-block'
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
        node.nodeName === 'DIV' &&
        (node as HTMLElement).getAttribute('data-type') === 'pdf-embed'
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
        node.nodeName === 'DIV' &&
        (node as HTMLElement).getAttribute('data-type') === 'vault-video'
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
        node.nodeName === 'SPAN' &&
        (node as HTMLElement).getAttribute('data-type') === 'wiki-link'
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
