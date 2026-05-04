'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { useEditorStore } from '@/stores/editor'
import { InlineFileTitle } from '@/components/shell/inline-file-title'
import { Button } from '@/components/ui/button'
import { toast } from '@/stores/toast'
import { vaultPathsPointToSameFile } from '@/lib/fs/vault-path-equiv'

/** Debounce interval for auto-save (ms) — matches markdown editor. */
const SAVE_DEBOUNCE_MS = 750

/**
 * Approximate rendered page width of a standard DOCX (A4/Letter + margins)
 * inside @eigenpal/docx-js-editor at 100% zoom. Used to compute the CSS zoom
 * ratio that fits the page into whatever container width is available.
 */
const DOCX_PAGE_WIDTH = 850

/**
 * DOCX editor powered by `@eigenpal/docx-js-editor`.
 *
 * Full WYSIWYG editing with auto-save back to the vault. The library is
 * lazy-loaded via dynamic import so the bundle is only pulled when a DOCX
 * tab is actually opened. ProseMirror-based — architecturally similar to
 * the Tiptap markdown editor already in use.
 *
 * Auto-save follows the same debounced pattern as the markdown editor:
 * every edit marks the tab dirty and schedules a 750ms debounced save.
 * On unmount, any pending timer is flushed synchronously-ish to avoid
 * data loss.
 */
export function DocxEditorView({
  tabId,
  path,
  onRenamed,
  onPersisted,
}: {
  tabId: string
  path: string
  onRenamed?: () => void
  onPersisted?: () => void
}) {
  const { vaultFs } = useVaultSession()
  const retargetTabPath = useEditorStore((s) => s.retargetTabPath)
  const updateTab = useEditorStore((s) => s.updateTab)
  const pathRef = useRef(path)
  pathRef.current = path

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onPersistedRef = useRef(onPersisted)
  onPersistedRef.current = onPersisted

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [docBuffer, setDocBuffer] = useState<ArrayBuffer | null>(null)

  // Lazy-loaded component ref
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [EditorComponent, setEditorComponent] = useState<any>(null)

  // ---- Load library + file ----
  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        // Load file bytes and library in parallel
        const [bytes, mod] = await Promise.all([
          vaultFs.readFile(path),
          import('@eigenpal/docx-js-editor'),
        ])
        if (cancelled) return

        // Convert Uint8Array to ArrayBuffer
        const buffer = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer

        setDocBuffer(buffer)
        setEditorComponent(() => mod.DocxEditor)
        setLoading(false)
      } catch (e) {
        console.error('DOCX editor load failed', e)
        if (!cancelled) {
          setError('Failed to load this DOCX file.')
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
    // Re-load only when the tab identity changes (new file opened).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId])

  // Track whether the editor is zoomed-out (compact mode) so we can show the
  // alpha disclaimer banner.
  const [isCompact, setIsCompact] = useState(false)

  // ---- Responsive zoom via ResizeObserver ----
  // The library renders document pages at a fixed ~850px width and centres
  // them, so on narrow containers both left and right edges get clipped.
  // We solve this by writing --docx-zoom onto the container element; the CSS
  // rule `zoom: var(--docx-zoom)` on the child scales the entire editor down
  // so the page always fits.  CSS `zoom` (unlike transform: scale) affects
  // layout, so the container's own scroll area stays correct.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const applyZoom = (width: number) => {
      const zoom = width < DOCX_PAGE_WIDTH ? Math.max(0.35, width / DOCX_PAGE_WIDTH) : 1
      container.style.setProperty('--docx-zoom', String(zoom))
      setIsCompact(zoom < 1)
    }

    // Run immediately (container is already in the DOM), then on every resize
    applyZoom(container.clientWidth)

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? container.clientWidth
      applyZoom(width)
    })
    observer.observe(container)

    return () => observer.disconnect()
    // containerRef is stable; DOCX_PAGE_WIDTH is a module-level const
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- Double-tap → dblclick forwarding ----
  // ProseMirror (which powers this editor) selects a word on dblclick, but
  // mobile browsers fire touchend rather than dblclick on double-tap.
  // We detect two taps within 300ms on the same approximate spot and
  // synthesise a dblclick at those coordinates so the editor's word-select
  // handler fires normally.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let lastTap = 0
    let lastX = 0
    let lastY = 0

    const onTouchEnd = (e: TouchEvent) => {
      const touch = e.changedTouches[0]
      if (!touch) return

      const now = Date.now()
      const dx = Math.abs(touch.clientX - lastX)
      const dy = Math.abs(touch.clientY - lastY)

      if (now - lastTap < 300 && dx < 20 && dy < 20) {
        // Double-tap detected — find the element under the finger and fire
        // dblclick so ProseMirror's word-select handler picks it up.
        const target = document.elementFromPoint(touch.clientX, touch.clientY)
        if (target) {
          target.dispatchEvent(
            new MouseEvent('dblclick', {
              bubbles: true,
              cancelable: true,
              clientX: touch.clientX,
              clientY: touch.clientY,
            }),
          )
        }
        lastTap = 0
      } else {
        lastTap = now
        lastX = touch.clientX
        lastY = touch.clientY
      }
    }

    container.addEventListener('touchend', onTouchEnd)
    return () => container.removeEventListener('touchend', onTouchEnd)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- Auto-save logic ----
  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      void (async () => {
        try {
          const buffer = await editorRef.current?.save()
          if (!buffer) return
          const bytes = new Uint8Array(buffer)
          await vaultFs.writeFile(pathRef.current, bytes)
          updateTab(tabId, { isDirty: false })
          onPersistedRef.current?.()
        } catch (e) {
          console.error('DOCX auto-save failed', e)
          toast.error('Failed to save document')
        }
      })()
    }, SAVE_DEBOUNCE_MS)
  }, [vaultFs, tabId, updateTab])

  // ---- onChange from editor ----
  const handleChange = useCallback(() => {
    updateTab(tabId, { isDirty: true })
    scheduleSave()
  }, [tabId, updateTab, scheduleSave])

  // ---- Flush save on unmount ----
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      // Flush final save
      void (async () => {
        try {
          const buffer = await editorRef.current?.save()
          if (!buffer) return
          const bytes = new Uint8Array(buffer)
          await vaultFs.writeFile(pathRef.current, bytes)
        } catch {
          // Best-effort on unmount
        }
      })()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId])

  // ---- Download original ----
  const handleDownload = useCallback(async () => {
    try {
      const bytes = await vaultFs.readFile(pathRef.current)
      const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = pathRef.current.split('/').pop() ?? 'document.docx'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to download file')
    }
  }, [vaultFs])

  // ---- Rename ----
  function handleRename(oldPath: string, newStem: string) {
    const nameWithExt = oldPath.split('/').pop() ?? oldPath
    const ext = nameWithExt.includes('.') ? nameWithExt.slice(nameWithExt.lastIndexOf('.')) : ''
    const fullName = newStem.endsWith(ext) ? newStem : `${newStem}${ext}`
    const parent = oldPath.includes('/') ? oldPath.slice(0, oldPath.lastIndexOf('/')) : ''
    const newPath = parent ? `${parent}/${fullName}` : fullName

    if (vaultPathsPointToSameFile(newPath, oldPath)) return

    void (async () => {
      try {
        if ((await vaultFs.exists(newPath)) && !vaultPathsPointToSameFile(newPath, oldPath)) {
          toast.error('A file with that name already exists')
          return
        }
        // Flush pending save before rename so we don't write to old path
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current)
          saveTimerRef.current = null
          const buffer = await editorRef.current?.save()
          if (buffer) {
            await vaultFs.writeFile(oldPath, new Uint8Array(buffer))
          }
        }
        await vaultFs.rename(oldPath, newPath)
        retargetTabPath(tabId, newPath, newPath.replace(/\.[^/.]+$/i, '').split('/').pop() ?? newPath)
        pathRef.current = newPath
        onRenamed?.()
        window.dispatchEvent(new CustomEvent('ink:vault-changed'))
      } catch {
        toast.error('Failed to rename')
      }
    })()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Toolbar — file title + download */}
      <div className="border-border bg-bg-secondary flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
        <InlineFileTitle path={path} onRename={handleRename} />
        <span className="text-fg-muted text-xs font-mono">.docx</span>

        {isCompact && (
          <span
            className="bg-bg-tertiary text-fg-muted rounded px-1.5 py-0.5 text-[10px] font-medium"
            title="Compact view is experimental on narrow screens"
          >
            compact · alpha
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          {/* Download original */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="size-7 p-0"
            onClick={() => void handleDownload()}
            aria-label="Download original DOCX"
            title="Download original"
          >
            <Download className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Editor area */}
      <div ref={containerRef} className="docx-editor-container relative min-h-0 flex-1">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-fg-muted text-sm">Loading document…</span>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-danger text-sm">{error}</span>
          </div>
        )}

        {!loading && !error && EditorComponent && docBuffer && (
          <EditorComponent
            ref={editorRef}
            documentBuffer={docBuffer}
            mode="editing"
            onChange={handleChange}
            showToolbar
            showRuler
          />
        )}
      </div>
    </div>
  )
}
