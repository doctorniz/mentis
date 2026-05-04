'use client'

import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import type { FileSystemAdapter } from '@/lib/fs'
import { assetToBlobUrl } from '@/lib/notes/assets'

let _vaultFs: FileSystemAdapter | null = null

export function setVideoVaultFs(fs: FileSystemAdapter) {
  _vaultFs = fs
}

function VideoNodeView({ node }: NodeViewProps) {
  const { src, title } = node.attrs as { src: string; title?: string }
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const urlRef = useRef<string | null>(null)

  useEffect(() => {
    if (!_vaultFs || !src) return
    let revoked = false
    void assetToBlobUrl(_vaultFs, src)
      .then((url) => {
        if (revoked) { URL.revokeObjectURL(url); return }
        urlRef.current = url
        setBlobUrl(url)
      })
      .catch((err) => {
        console.error('Failed to load video:', src, err)
        setError(`Could not load video: ${src}`)
      })
    return () => {
      revoked = true
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
      }
      setBlobUrl(null)
    }
  }, [src])

  if (!_vaultFs) {
    return (
      <NodeViewWrapper>
        <span className="text-fg-muted text-xs">No vault FS for video</span>
      </NodeViewWrapper>
    )
  }

  if (error) {
    return (
      <NodeViewWrapper>
        <div className="border-border bg-bg-secondary my-2 rounded-lg border px-4 py-3">
          <p className="text-danger text-xs">{error}</p>
        </div>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper>
      <div className="my-2">
        {blobUrl ? (
          /* eslint-disable-next-line jsx-a11y/media-has-caption */
          <video
            src={blobUrl}
            controls
            className="w-full max-w-2xl rounded-lg"
            title={title ?? src}
          />
        ) : (
          <div className="border-border bg-bg-secondary flex h-20 items-center justify-center rounded-lg border">
            <span className="text-fg-muted text-xs">Loading {title ?? src}…</span>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  )
}

export const VaultVideoExtension = Node.create({
  name: 'vaultVideo',
  group: 'block',
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-src') ?? null,
      },
      title: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-title') ?? null,
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="vault-video"]' }]
  },

  renderHTML({ node }) {
    return [
      'div',
      mergeAttributes({
        'data-type': 'vault-video',
        'data-src': node.attrs.src ?? '',
        'data-title': node.attrs.title ?? '',
        class: 'vault-video-placeholder',
      }),
      node.attrs.src ?? '',
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(VideoNodeView)
  },
})
