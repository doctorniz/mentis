import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Underline from '@tiptap/extension-underline'
import { generateHTML, generateJSON } from '@tiptap/html'
import { marked } from 'marked'
import TurndownService from 'turndown'
import type { Extensions, JSONContent } from '@tiptap/core'

export function getBoardEditorExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1] },
      codeBlock: false,
    }),
    Underline,
    Link.configure({ openOnClick: false, autolink: true }),
    TaskList,
    TaskItem.configure({ nested: false }),
  ]
}

/** Convert markdown body text to Tiptap JSON for loading into the board editor. */
export function boardMarkdownToJSON(markdown: string): JSONContent {
  const html = String(marked.parse(markdown || '', { gfm: true, breaks: false }))
  return generateJSON(html || '<p></p>', getBoardEditorExtensions())
}

/** Convert Tiptap editor JSON back to markdown for storing in the .md file. */
export function boardJSONToMarkdown(doc: JSONContent): string {
  const html = generateHTML(doc, getBoardEditorExtensions())
  const td = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
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
  return td.turndown(html).trim()
}
