'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { useEditorStore } from '@/stores/editor'
import { usePptxStore } from '@/stores/pptx'
import { toast } from '@/stores/toast'
import { InlineFileTitle } from '@/components/shell/inline-file-title'
import { vaultPathsPointToSameFile } from '@/lib/fs/vault-path-equiv'

/** Debounce interval for auto-save after edits stop (ms). */
const SAVE_DEBOUNCE_MS = 3_000

/**
 * PPTX editor powered by `slidecanvas`.
 *
 * Lazy-loads the SlideCanvas `PptEditor` component. Reads the .pptx file
 * from the vault FS, passes raw bytes via `fetchPresentation`, and
 * auto-saves on change using `PptxBlobExporter`.
 *
 * SlideCanvas provides its own full ribbon UI (toolbar, slide reel,
 * Export/Present/Delete actions), so this wrapper is minimal — just
 * load, save, and containment.
 */
export function PptxEditorView({
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
  const updateTab = useEditorStore((s) => s.updateTab)
  const retargetTabPath = useEditorStore((s) => s.retargetTabPath)
  const { setLoading, setError, markDirty, markSaved, reset } = usePptxStore()
  const isLoading = usePptxStore((s) => s.isLoading)
  const error = usePptxStore((s) => s.error)

  const pathRef = useRef(path)
  pathRef.current = path
  const onPersistedRef = useRef(onPersisted)
  onPersistedRef.current = onPersisted
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Latest presentation state from onChange
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const presentationRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exporterRef = useRef<any>(null)

  // Lazy-loaded SlideCanvas component
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [SlideEditor, setSlideEditor] = useState<any>(null)
  const [ready, setReady] = useState(false)

  // Raw file bytes — passed directly to SlideCanvas via fetchPresentation
  // to avoid a blob-URL round-trip that corrupts the ZIP structure.
  const fileBytesRef = useRef<ArrayBuffer | null>(null)

  // ---- Load library + file ----
  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const [bytes, mod] = await Promise.all([
          vaultFs.readFile(path),
          import('slidecanvas'),
        ])
        if (cancelled) return

        fileBytesRef.current = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer

        setSlideEditor(() => mod.PptEditor)
        if (mod.PptxBlobExporter) {
          exporterRef.current = new mod.PptxBlobExporter()
        }
        setReady(true)
        setLoading(false)
      } catch (e) {
        console.error('PPTX editor load failed', e)
        if (!cancelled) {
          setError('Failed to load this PPTX file.')
          setLoading(false)
        }
      }
    }

    void load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId])

  // Reset store on unmount
  useEffect(() => {
    return () => { reset() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId])

  // ---- Save helper ----
  const flushSave = useCallback(async () => {
    const pres = presentationRef.current
    if (!pres || !exporterRef.current) return
    try {
      const blob: Blob = await exporterRef.current.exportToBlob(pres)
      const buffer = await blob.arrayBuffer()
      await vaultFs.writeFile(pathRef.current, new Uint8Array(buffer))
      updateTab(tabId, { isDirty: false })
      markSaved()
      onPersistedRef.current?.()
    } catch (e) {
      console.error('PPTX auto-save failed', e)
      toast.error('Failed to save presentation')
    }
  }, [vaultFs, tabId, updateTab, markSaved])

  // ---- Auto-save on change ----
  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      void flushSave()
    }, SAVE_DEBOUNCE_MS)
  }, [flushSave])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleChange = useCallback((presentation: any) => {
    presentationRef.current = presentation
    updateTab(tabId, { isDirty: true })
    markDirty()
    scheduleSave()
  }, [tabId, updateTab, markDirty, scheduleSave])

  // ---- Flush save on unmount ----
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      void flushSave()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId])

  // ---- Custom fetcher — returns bytes we already read from disk ----
  const fetchPresentation = useCallback(async (_url: string) => {
    if (!fileBytesRef.current) throw new Error('File bytes not loaded')
    return new Blob([fileBytesRef.current], {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    })
  }, [])

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
          await flushSave()
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
    <div className="pptx-editor-root flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Title bar — matches docx / xlsx / canvas style */}
      <div className="border-border bg-bg-secondary flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
        <InlineFileTitle path={path} onRename={handleRename} />
        <span className="text-fg-muted font-mono text-xs">.pptx</span>
      </div>

      {isLoading && (
        <div className="flex flex-1 items-center justify-center">
          <span className="text-fg-muted text-sm">Loading presentation…</span>
        </div>
      )}

      {error && (
        <div className="flex flex-1 items-center justify-center">
          <span className="text-danger text-sm">{error}</span>
        </div>
      )}

      {!isLoading && !error && SlideEditor && ready && (
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <SlideEditor
            url="local://vault-file"
            fetchPresentation={fetchPresentation}
            width="100%"
            height="100%"
            appName="Mentis"
            appBgColor="#6d28d9"
            onChange={handleChange}
          />
        </div>
      )}
    </div>
  )
}
