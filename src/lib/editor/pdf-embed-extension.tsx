'use client'

import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { PdfEmbedView } from '@/components/notes/pdf-embed-view'
import type { FileSystemAdapter } from '@/lib/fs'

let _vaultFs: FileSystemAdapter | null = null

export function setPdfEmbedVaultFs(fs: FileSystemAdapter) {
  _vaultFs = fs
}

function PdfEmbedNodeView({ node }: NodeViewProps) {
  const { file, page } = node.attrs as { file: string; page: string }

  if (!_vaultFs) {
    return (
      <NodeViewWrapper>
        <span className="text-fg-muted text-xs">No vault FS for PDF embed</span>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper>
      <PdfEmbedView file={file} page={page} vaultFs={_vaultFs} />
    </NodeViewWrapper>
  )
}

export const PdfEmbedExtension = Node.create({
  name: 'pdfEmbed',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      file: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-file'),
        renderHTML: (attrs) => ({ 'data-file': attrs.file }),
      },
      page: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-page'),
        renderHTML: (attrs) => ({ 'data-page': attrs.page }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="pdf-embed"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'pdf-embed' }),
      `![[${HTMLAttributes['data-file']}#page=${HTMLAttributes['data-page']}]]`,
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(PdfEmbedNodeView)
  },
})
