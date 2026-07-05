'use client'

import { useRef, useState } from 'react'
import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { Check, PencilLine } from 'lucide-react'
import { VaultImageView } from '@/components/notes/vault-image-view'
import { imageNodeAttributes } from '@/lib/editor/vault-image-node'
import { cn } from '@/utils/cn'
import type { FileSystemAdapter } from '@/lib/fs'

let _vaultFs: FileSystemAdapter | null = null

export function setImageVaultFs(fs: FileSystemAdapter) {
  _vaultFs = fs
}

const MIN_WIDTH_PX = 80

function ImageNodeView({ node, selected, updateAttributes }: NodeViewProps) {
  const { src, alt, width } = node.attrs as {
    src: string
    alt?: string | null
    width?: number | null
  }
  /** Live width while dragging the handle; null when idle. */
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const [editingAlt, setEditingAlt] = useState(false)
  const [altDraft, setAltDraft] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)

  const displayWidth = dragWidth ?? width ?? null
  const showControls = selected || editingAlt || dragWidth != null

  function startResize(e: React.PointerEvent) {
    // Keep ProseMirror from starting a node drag / reselect.
    e.preventDefault()
    e.stopPropagation()
    const img = wrapRef.current?.querySelector('img')
    if (!img) return
    const startX = e.clientX
    const startW = img.getBoundingClientRect().width
    const maxW =
      wrapRef.current?.closest('.tiptap-editor')?.getBoundingClientRect().width ?? Infinity

    const widthAt = (ev: PointerEvent) =>
      Math.round(Math.min(maxW, Math.max(MIN_WIDTH_PX, startW + (ev.clientX - startX))))

    const onMove = (ev: PointerEvent) => setDragWidth(widthAt(ev))
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setDragWidth(null)
      updateAttributes({ width: widthAt(ev) })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function commitAlt() {
    updateAttributes({ alt: altDraft.trim() || null })
    setEditingAlt(false)
  }

  if (!_vaultFs) {
    return (
      <NodeViewWrapper>
        <span className="text-fg-muted text-xs">No vault FS for image</span>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper>
      <div
        ref={wrapRef}
        className={cn('relative inline-block max-w-full', selected && 'ring-accent rounded ring-2')}
        style={displayWidth ? { width: displayWidth } : undefined}
      >
        <VaultImageView
          src={src}
          alt={alt}
          vaultFs={_vaultFs}
          imgClassName={displayWidth ? 'w-full my-0' : 'my-0'}
        />

        {showControls && (
          <>
            {/* Alt text: chip → inline input */}
            <div
              className="absolute top-1.5 right-1.5 flex items-center gap-1"
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {editingAlt ? (
                <div className="border-border bg-bg flex items-center gap-1 rounded-md border p-0.5 shadow-md">
                  <input
                    type="text"
                    value={altDraft}
                    onChange={(e) => setAltDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        commitAlt()
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault()
                        setEditingAlt(false)
                      }
                    }}
                    placeholder="Alt text"
                    aria-label="Alt text"
                    autoFocus
                    className="bg-bg-secondary text-fg placeholder:text-fg-muted w-40 rounded px-1.5 py-0.5 text-xs outline-none"
                  />
                  <button
                    type="button"
                    onClick={commitAlt}
                    title="Save alt text"
                    aria-label="Save alt text"
                    className="text-fg-secondary hover:text-fg hover:bg-bg-hover flex size-5 items-center justify-center rounded transition-colors"
                  >
                    <Check className="size-3" aria-hidden />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setAltDraft(alt ?? '')
                    setEditingAlt(true)
                  }}
                  title="Edit alt text"
                  aria-label="Edit alt text"
                  className="border-border bg-bg/90 text-fg-secondary hover:text-fg flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium shadow-md backdrop-blur transition-colors"
                >
                  <PencilLine className="size-3" aria-hidden />
                  Alt
                </button>
              )}
            </div>

            {/* Resize handle (drag; double-click resets to natural size) */}
            <div
              role="separator"
              aria-label="Resize image"
              title="Drag to resize · double-click to reset"
              onPointerDown={startResize}
              onDoubleClick={(e) => {
                e.stopPropagation()
                updateAttributes({ width: null })
              }}
              className="bg-accent border-bg absolute -right-1.5 -bottom-1.5 size-3.5 cursor-se-resize rounded-full border-2 shadow"
            />
            {dragWidth != null && (
              <span className="bg-bg/90 text-fg-secondary border-border absolute right-2 bottom-2 rounded border px-1.5 py-0.5 text-[10px] tabular-nums shadow">
                {dragWidth}px
              </span>
            )}
          </>
        )}
      </div>
    </NodeViewWrapper>
  )
}

export const VaultImageExtension = Node.create({
  name: 'image',
  group: 'block',
  draggable: true,
  atom: true,

  addAttributes() {
    return imageNodeAttributes()
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
