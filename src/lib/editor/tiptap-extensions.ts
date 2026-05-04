import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Underline from '@tiptap/extension-underline'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import type { Extensions } from '@tiptap/react'
import { inkSlashCommands } from '@/lib/editor/slash-command-extension'
import { WikiLinkNode } from '@/lib/editor/wiki-link-node'
import { MathInline, MathBlock } from '@/lib/editor/math-node'
import { VaultImage } from '@/lib/editor/vault-image-node'
import { VaultImageExtension } from '@/lib/editor/vault-image-extension'
import { VaultVideo } from '@/lib/editor/vault-video-node'
import { VaultVideoExtension } from '@/lib/editor/vault-video-extension'
import { PdfEmbedNode } from '@/lib/editor/pdf-embed-node'
import { PdfEmbedExtension } from '@/lib/editor/pdf-embed-extension'
import { createInkWikiLinkSuggestion } from '@/lib/editor/wiki-link-suggestion'

const lowlight = createLowlight(common)

export type NoteEditorWikiOptions = {
  getMarkdownPaths: () => string[]
  currentNotePath?: () => string | null
}

export function getNoteEditorExtensions(
  placeholder = 'Write something…',
  wiki?: NoteEditorWikiOptions,
  options?: { liveEditor?: boolean },
): Extensions {
  const ex: Extensions = [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      bulletList: { keepMarks: true, keepAttributes: false },
      orderedList: { keepMarks: true, keepAttributes: false },
      codeBlock: false,
    }),
    CodeBlockLowlight.configure({ lowlight, defaultLanguage: null }),
    Underline,
    Link.configure({ openOnClick: false, autolink: true }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: false, HTMLAttributes: { class: 'ink-table' } }),
    TableRow,
    TableCell,
    TableHeader,
    WikiLinkNode,
    MathInline,
    MathBlock,
    options?.liveEditor ? VaultImageExtension : VaultImage,
    options?.liveEditor ? VaultVideoExtension : VaultVideo,
    options?.liveEditor ? PdfEmbedExtension : PdfEmbedNode,
    Placeholder.configure({ placeholder }),
    inkSlashCommands,
  ]
  if (wiki) {
    ex.push(createInkWikiLinkSuggestion(wiki))
  }
  return ex
}
