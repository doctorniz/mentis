'use client'

import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { VaultImageView } from '@/components/notes/vault-image-view'
import type { FileSystemAdapter } from '@/lib/fs'

let _vaultFs: FileSystemAdapter | null = null

export function setImageVaultFs(fs: FileSystemAdapter) {
  _vaultFs = fs
}

function ImageNodeView({ node }: NodeViewProps) {
  const { src, alt } = node.attrs as { src: string; alt?: string }

  if (!_vaultFs) {
    return (
      <NodeViewWrapper>
        <span className="text-fg-muted text-xs">No vault FS for image</span>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper>
      <VaultImageView src={src} alt={alt} vaultFs={_vaultFs} />
    </NodeViewWrapper>
  )
}

export const VaultImageExtension = Node.create({
  name: 'image',
  group: 'block',
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'img[src]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView)
  },
})
