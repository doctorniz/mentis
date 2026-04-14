'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { usePdfStore } from '@/stores/pdf'
import { useVaultStore } from '@/stores/vault'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { useSyncPush } from '@/contexts/sync-context'
import { DEFAULT_VAULT_CONFIG } from '@/types/vault'
import { loadPdfjs } from '@/lib/pdf/pdfjs-loader'
import { readPageAnnotations } from '@/lib/pdf/annotation-reader'
import { writeAnnotationsIntoPdf } from '@/lib/pdf/annotation-writer'
import { loadSignatures, addSignatureToVault } from '@/lib/pdf/signature-store'
import {
  insertBlankPage,
  appendBlankPage,
  deletePage,
  rotatePage,
  reorderPages,
  mergePages,
  extractPages,
} from '@/lib/pdf/page-operations'
import { PdfUndoStack } from '@/lib/pdf/undo-stack'
import { createSnapshot, pruneSnapshots } from '@/lib/snapshot'
import { useEditorStore } from '@/stores/editor'
import { toast } from '@/stores/toast'
import type { PdfAnnotation, PdfPageInfo, PdfNewPageOptions, PdfTextComment, Signature } from '@/types/pdf'
import { PdfAnnotationType, PdfTool } from '@/types/pdf'
import { PdfToolbar } from '@/components/pdf/pdf-toolbar'
import { PdfPageCanvas } from '@/components/pdf/pdf-page-canvas'
import { PdfSideColumn, type SideColumnTab } from '@/components/pdf/pdf-side-column'
import { SignaturePadDialog } from '@/components/pdf/signature-pad-dialog'
import { PdfFormDialog } from '@/components/pdf/pdf-form-dialog'
import { PdfVersionHistory } from '@/components/pdf/pdf-version-history'
import { PdfCommentDialog } from '@/components/pdf/pdf-comment-dialog'
import { PdfPageCommentRail } from '@/components/pdf/pdf-page-comment-rail'
import { Button } from '@/components/ui/button'
import { searchPdfDocument } from '@/lib/pdf/search-pdf-text'
import type { PdfTextSearchMatch } from '@/lib/pdf/search-pdf-text'

export function PdfViewer({ path }: { path: string }) {
  const { vaultFs } = useVaultSession()
  const syncPush = useSyncPush()
  const autoSaveConfig = useVaultStore((s) => s.config?.autoSave ?? DEFAULT_VAULT_CONFIG.autoSave)
  const setDocument = usePdfStore((s) => s.setDocument)
  const currentPage = usePdfStore((s) => s.currentPage)
  const setCurrentPage = usePdfStore((s) => s.setCurrentPage)
  const zoom = usePdfStore((s) => s.zoom)
  const annotations = usePdfStore((s) => s.annotations)
  const hasUnsavedChanges = usePdfStore((s) => s.hasUnsavedChanges)
  const hasSessionSnapshot = usePdfStore((s) => s.hasSessionSnapshot)
  const setHasSessionSnapshot = usePdfStore((s) => s.setHasSessionSnapshot)
  const markSaved = usePdfStore((s) => s.markSaved)
  const reset = usePdfStore((s) => s.reset)
  const pendingPdfComment = usePdfStore((s) => s.pendingPdfComment)
  const setPendingPdfComment = usePdfStore((s) => s.setPendingPdfComment)

  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
  const [pages, setPages] = useState<PDFPageProxy[]>([])
  const [_existingAnns, setExistingAnns] = useState<PdfAnnotation[]>([])
  const [saving, setSaving] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMatches, setSearchMatches] = useState<PdfTextSearchMatch[]>([])
  const [activeSearchIdx, setActiveSearchIdx] = useState(0)
  const [searchBusy, setSearchBusy] = useState(false)
  const searchSeqRef = useRef(0)
  const [sigDialogOpen, setSigDialogOpen] = useState(false)
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [sideColumnOpen, setSideColumnOpen] = useState(true)
  const [sideColumnTab, setSideColumnTab] = useState<SideColumnTab>('pages')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [signatures, setSignatures] = useState<Signature[]>([])
  const [activeSignature, setActiveSignature] = useState<Signature | null>(null)
  const [rawPdfBytes, setRawPdfBytes] = useState<Uint8Array | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hasUnsavedRef = useRef(hasUnsavedChanges)
  hasUnsavedRef.current = hasUnsavedChanges
  const undoStackRef = useRef(new PdfUndoStack())
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  /** (Re)load the PDF from disk into viewer state. Shared between initial load and post-operation reloads. */
  const loadPdf = useCallback(
    async (signal: { cancelled: boolean }) => {
      try {
        const pdfjs = await loadPdfjs()
        const data = await vaultFs.readFile(path)
        if (signal.cancelled) return

        if (data.length >= 5) {
          const header = String.fromCharCode(data[0]!, data[1]!, data[2]!, data[3]!, data[4]!)
          if (header !== '%PDF-') {
            console.error('PDF integrity check failed: missing %PDF- header for', path)
            toast.warning('PDF may be corrupted — missing file header')
          }
        }

        setRawPdfBytes(data)
        const doc = await pdfjs.getDocument({ data: data.slice() }).promise
        if (signal.cancelled) return
        setPdfDoc(doc)

        const pageInfos: PdfPageInfo[] = []
        const pageProxies: PDFPageProxy[] = []
        const allAnns: PdfAnnotation[] = []
        for (let i = 1; i <= doc.numPages; i++) {
          const p = await doc.getPage(i)
          const vp = p.getViewport({ scale: 1 })
          pageInfos.push({
            index: i - 1,
            width: vp.width,
            height: vp.height,
            rotation: vp.rotation,
          })
          pageProxies.push(p)
          const anns = await readPageAnnotations(p, i - 1)
          allAnns.push(...anns)
        }

        if (signal.cancelled) return
        setPages(pageProxies)
        setExistingAnns(allAnns)

        setDocument({
          path,
          pageCount: doc.numPages,
          title: ((await doc.getMetadata().catch(() => null))?.info as Record<string, unknown> | undefined)?.Title as string | undefined,
          pages: pageInfos,
        })
        for (const a of allAnns) {
          usePdfStore.getState().addAnnotation(a, { fromLoader: true })
        }
      } catch (e) {
        console.error('PDF load failed', e)
        toast.error('Failed to load PDF')
      }
    },
    [path, vaultFs, setDocument],
  )

  useEffect(() => {
    const signal = { cancelled: false }
    void loadPdf(signal)
    return () => {
      signal.cancelled = true
      reset()
    }
  }, [loadPdf, reset])

  useEffect(() => {
    if (pages.length <= 1) setSideColumnOpen(false)
    else setSideColumnOpen(true)
  }, [pages.length])

  /* Load signatures from vault */
  useEffect(() => {
    void loadSignatures(vaultFs).then(setSignatures)
  }, [vaultFs])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || pages.length === 0) return
    const wrapper = el.firstElementChild
    if (!wrapper) return
    const target = wrapper.children[currentPage] as HTMLElement | undefined
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [currentPage, pages.length])

  useEffect(() => {
    if (!searchOpen) {
      setSearchMatches([])
      setSearchBusy(false)
      return
    }
    const q = searchQuery.trim()
    if (!q) {
      setSearchMatches([])
      setActiveSearchIdx(0)
      setSearchBusy(false)
      return
    }
    if (pages.length === 0) return
    const seq = ++searchSeqRef.current
    setSearchBusy(true)
    const timer = window.setTimeout(() => {
      void searchPdfDocument(pages, q, zoom)
        .then((m) => {
          if (searchSeqRef.current !== seq) return
          setSearchMatches(m)
          setActiveSearchIdx(0)
        })
        .catch((e) => {
          console.error('PDF search failed', e)
          if (searchSeqRef.current !== seq) return
          setSearchMatches([])
          toast.warning('Could not search this PDF')
        })
        .finally(() => {
          if (searchSeqRef.current !== seq) return
          setSearchBusy(false)
        })
    }, 280)
    return () => window.clearTimeout(timer)
  }, [searchOpen, searchQuery, pages, zoom])

  useEffect(() => {
    if (!searchOpen || searchMatches.length === 0) return
    const idx = Math.min(activeSearchIdx, searchMatches.length - 1)
    const m = searchMatches[idx]
    if (m) setCurrentPage(m.pageIndex)
  }, [searchOpen, searchMatches, activeSearchIdx, setCurrentPage])

  const searchHighlightsByPage = useMemo(() => {
    const map = new Map<
      number,
      Array<{ x: number; y: number; width: number; height: number; active: boolean }>
    >()
    for (let i = 0; i < searchMatches.length; i++) {
      const m = searchMatches[i]!
      const list = map.get(m.pageIndex) ?? []
      list.push({ ...m.rect, active: i === activeSearchIdx })
      map.set(m.pageIndex, list)
    }
    return map
  }, [searchMatches, activeSearchIdx])

  const goSearchPrev = useCallback(() => {
    if (searchMatches.length === 0) return
    setActiveSearchIdx((i) => (i - 1 + searchMatches.length) % searchMatches.length)
  }, [searchMatches.length])

  const goSearchNext = useCallback(() => {
    if (searchMatches.length === 0) return
    setActiveSearchIdx((i) => (i + 1) % searchMatches.length)
  }, [searchMatches.length])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const oldBytes = await vaultFs.readFile(path)
      const newBytes = await writeAnnotationsIntoPdf(oldBytes, annotations)

      const tmpPath = path + '.__ink_tmp'
      await vaultFs.writeFile(tmpPath, newBytes)
      const written = await vaultFs.readFile(tmpPath)
      if (written.length >= 5) {
        const h = String.fromCharCode(written[0]!, written[1]!, written[2]!, written[3]!, written[4]!)
        if (h !== '%PDF-') {
          await vaultFs.remove(tmpPath).catch(() => {})
          throw new Error('Written PDF failed integrity check')
        }
      }
      await vaultFs.rename(tmpPath, path)
      syncPush(path)
      markSaved()
      const savedPage = usePdfStore.getState().currentPage
      const savedZoom = usePdfStore.getState().zoom
      await loadPdf({ cancelled: false })
      const count = usePdfStore.getState().document?.pageCount ?? 1
      usePdfStore.getState().setCurrentPage(Math.min(Math.max(0, savedPage), count - 1))
      usePdfStore.getState().setZoom(savedZoom)
    } catch (e) {
      console.error('Save failed', e)
      toast.error('Failed to save PDF annotations')
    } finally {
      setSaving(false)
    }
  }, [vaultFs, path, annotations, markSaved, loadPdf])

  /* Snapshot on first edit in this session */
  useEffect(() => {
    if (!hasUnsavedChanges || hasSessionSnapshot) return
    void (async () => {
      try {
        await createSnapshot(vaultFs, path)
        await pruneSnapshots(vaultFs, { enabled: true, maxPerFile: 5, retentionDays: 30 })
        setHasSessionSnapshot(true)
      } catch (e) {
        console.error('Snapshot failed', e)
        toast.warning('Could not create PDF snapshot')
      }
    })()
  }, [hasUnsavedChanges, hasSessionSnapshot, vaultFs, path, setHasSessionSnapshot])

  /* Auto-save: vault interval + optional blur */
  useEffect(() => {
    if (!autoSaveConfig.enabled) {
      return () => {}
    }

    autoSaveRef.current = setInterval(() => {
      if (hasUnsavedRef.current) void handleSave()
    }, autoSaveConfig.intervalMs)

    function onBlur() {
      if (hasUnsavedRef.current) void handleSave()
    }
    if (autoSaveConfig.saveOnBlur) {
      window.addEventListener('blur', onBlur)
    }

    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current)
      window.removeEventListener('blur', onBlur)
    }
  }, [handleSave, autoSaveConfig.enabled, autoSaveConfig.intervalMs, autoSaveConfig.saveOnBlur])

  const syncUndoState = useCallback(() => {
    setCanUndo(undoStackRef.current.canUndo)
    setCanRedo(undoStackRef.current.canRedo)
  }, [])

  /** Apply a transform to the raw PDF bytes, write to disk, and reload. */
  const applyPageOp = useCallback(
    async (transform: (bytes: Uint8Array) => Promise<Uint8Array>) => {
      try {
        const bytes = rawPdfBytes ?? await vaultFs.readFile(path)
        undoStackRef.current.push(bytes)
        const newBytes = await transform(bytes)
        await vaultFs.writeFile(path, newBytes)
        syncPush(path)
        setRawPdfBytes(newBytes)
        syncUndoState()
        await loadPdf({ cancelled: false })
      } catch (e) {
        console.error('PDF page operation failed', e)
        toast.error('Could not update PDF pages')
      }
    },
    [rawPdfBytes, vaultFs, path, loadPdf, syncUndoState, syncPush],
  )

  const handleInsertBlank = useCallback(
    (beforeIndex: number) => {
      const opts: PdfNewPageOptions = { style: 'blank', size: 'a4' }
      void applyPageOp((b) => insertBlankPage(b, beforeIndex, opts))
    },
    [applyPageOp],
  )

  const handleAddPage = useCallback(() => {
    const opts: PdfNewPageOptions = { style: 'blank', size: 'a4' }
    void applyPageOp((b) => appendBlankPage(b, opts))
  }, [applyPageOp])

  const handleDeletePage = useCallback(
    (index: number) => {
      const pageCount = usePdfStore.getState().document?.pageCount ?? 0
      if (pageCount <= 1) return
      void applyPageOp((b) => deletePage(b, index))
    },
    [applyPageOp],
  )

  const handleRotatePage = useCallback(
    (index: number) => {
      void applyPageOp((b) => rotatePage(b, index, 90))
    },
    [applyPageOp],
  )

  const handleReorder = useCallback(
    (newOrder: number[]) => {
      void applyPageOp((b) => reorderPages(b, newOrder))
    },
    [applyPageOp],
  )

  const handleMerge = useCallback(
    (files: FileList) => {
      const file = files[0]
      if (!file || !file.name.endsWith('.pdf')) return
      void (async () => {
        const buf = await file.arrayBuffer()
        const otherBytes = new Uint8Array(buf)
        await applyPageOp((b) => mergePages(b, otherBytes))
      })()
    },
    [applyPageOp],
  )

  const handleExtractPages = useCallback(
    (indices: number[]) => {
      if (!indices.length) return
      void (async () => {
        try {
          const bytes = await vaultFs.readFile(path)
          const newBytes = await extractPages(bytes, indices)

          const stem = path.replace(/\.[^/.]+$/i, '').split('/').pop() ?? 'Extracted'
          const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
          const label = indices.length === 1
            ? `p${indices[0]! + 1}`
            : `p${indices[0]! + 1}-${indices[indices.length - 1]! + 1}`
          const newName = `${stem} (${label}).pdf`
          const newPath = dir ? `${dir}/${newName}` : newName

          await vaultFs.writeFile(newPath, new Uint8Array(newBytes))
          window.dispatchEvent(new CustomEvent('ink:vault-changed'))

          useEditorStore.getState().openTab({
            id: crypto.randomUUID(),
            path: newPath,
            type: 'pdf',
            title: `${stem} (${label})`,
            isDirty: false,
          })

          toast.success(`Saved ${indices.length} page${indices.length > 1 ? 's' : ''} as ${newName}`)
        } catch (e) {
          console.error('Extract pages failed', e)
          toast.error('Could not extract pages')
        }
      })()
    },
    [vaultFs, path],
  )

  const handleFormSave = useCallback(
    (newBytes: Uint8Array) => {
      void (async () => {
        await vaultFs.writeFile(path, newBytes)
        setRawPdfBytes(newBytes)
        await loadPdf({ cancelled: false })
      })()
    },
    [vaultFs, path, loadPdf],
  )

  const handleUndo = useCallback(async () => {
    const current = rawPdfBytes ?? await vaultFs.readFile(path)
    const prev = undoStackRef.current.undo(current)
    if (!prev) return
    try {
      await vaultFs.writeFile(path, prev)
      setRawPdfBytes(prev)
      syncUndoState()
      await loadPdf({ cancelled: false })
      toast.success('Undone')
    } catch (e) {
      console.error('Undo failed', e)
      toast.error('Undo failed')
    }
  }, [rawPdfBytes, vaultFs, path, loadPdf, syncUndoState])

  const handleRedo = useCallback(async () => {
    const current = rawPdfBytes ?? await vaultFs.readFile(path)
    const next = undoStackRef.current.redo(current)
    if (!next) return
    try {
      await vaultFs.writeFile(path, next)
      setRawPdfBytes(next)
      syncUndoState()
      await loadPdf({ cancelled: false })
      toast.success('Redone')
    } catch (e) {
      console.error('Redo failed', e)
      toast.error('Redo failed')
    }
  }, [rawPdfBytes, vaultFs, path, loadPdf, syncUndoState])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'z' && e.key !== 'Z') return
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      if (e.shiftKey) void handleRedo()
      else void handleUndo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleUndo, handleRedo])

  const handlePdfCommentSubmit = useCallback(
    (text: string) => {
      const pending = usePdfStore.getState().pendingPdfComment
      if (!pending) return
      const { pageIndex, anchorPdfX, anchorPdfY } = pending
      const ann: PdfTextComment = {
        id: crypto.randomUUID(),
        type: PdfAnnotationType.Text,
        pageIndex,
        rect: { x: anchorPdfX, y: anchorPdfY, width: 18, height: 18 },
        text,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
      }
      usePdfStore.getState().addAnnotation(ann)
      setPendingPdfComment(null)
      usePdfStore.getState().setActiveTool(PdfTool.Select)
    },
    [setPendingPdfComment],
  )

  const handleNewSignature = useCallback(
    async (imageDataUrl: string, name: string) => {
      const sig: Signature = {
        id: crypto.randomUUID(),
        name,
        imageDataUrl,
        createdAt: new Date().toISOString(),
      }
      await addSignatureToVault(vaultFs, sig)
      setSignatures((prev) => [...prev, sig])
      setActiveSignature(sig)
      usePdfStore.getState().addSignature(sig)
    },
    [vaultFs],
  )

  if (!pdfDoc || pages.length === 0) {
    return (
      <div className="text-fg-muted flex h-full items-center justify-center text-sm">
        Loading PDF…
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PdfToolbar
        onSearch={() => setSearchOpen((o) => !o)}
        signatures={signatures}
        activeSignature={activeSignature}
        onPickSignature={(sig) => setActiveSignature(sig)}
        onNewSignature={() => setSigDialogOpen(true)}
        onOpenFormDialog={() => setFormDialogOpen(true)}
        historyOpen={historyOpen}
        onToggleHistory={() => setHistoryOpen((o) => !o)}
        onAddPage={handleAddPage}
        canUndo={canUndo}
        onUndo={() => void handleUndo()}
        canRedo={canRedo}
        onRedo={() => void handleRedo()}
      />
      {searchOpen && (
        <div className="border-border bg-bg-secondary flex flex-wrap items-center gap-2 border-b px-3 py-1.5">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (e.shiftKey) goSearchPrev()
                else goSearchNext()
              }
            }}
            placeholder="Find in document…"
            aria-label="Search in PDF text"
            className="border-border focus:border-accent focus:ring-accent/20 bg-bg text-fg min-w-[12rem] flex-1 rounded-md border px-2 py-1 text-sm focus:ring-1 focus:outline-none sm:max-w-xs"
            autoFocus
          />
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={searchMatches.length === 0 || searchBusy}
              onClick={goSearchPrev}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={searchMatches.length === 0 || searchBusy}
              onClick={goSearchNext}
            >
              Next
            </Button>
          </div>
          <span className="text-fg-muted text-xs">
            {searchBusy && 'Searching…'}
            {!searchBusy && searchQuery.trim() && searchMatches.length === 0 && 'No matches'}
            {!searchBusy &&
              searchMatches.length > 0 &&
              `${activeSearchIdx + 1} / ${searchMatches.length} match${searchMatches.length === 1 ? '' : 'es'}`}
            {!searchBusy && !searchQuery.trim() && 'Type to search extractable text · Enter / Shift+Enter'}
          </span>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <PdfSideColumn
          expanded={sideColumnOpen}
          onToggleExpand={() => setSideColumnOpen((o) => !o)}
          activeTab={sideColumnTab}
          onTabChange={setSideColumnTab}
          pdfDoc={pdfDoc}
          onNavigate={(idx) => setCurrentPage(idx)}
          pages={pages}
          onReorder={handleReorder}
          onInsertBlank={handleInsertBlank}
          onDelete={handleDeletePage}
          onRotate={handleRotatePage}
          onMerge={handleMerge}
          onExtractPages={handleExtractPages}
        />
        <div ref={scrollRef} className="bg-bg-tertiary min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col items-center gap-4 py-4">
            {pages.map((p, i) => {
              const vp = p.getViewport({ scale: zoom })
              const pageH = Math.floor(vp.height)
              const textComments = annotations.filter(
                (a): a is PdfTextComment =>
                  a.type === PdfAnnotationType.Text && a.pageIndex === i,
              )
              return (
                <div
                  key={i}
                  className="flex w-full max-w-full flex-col items-stretch gap-2 sm:flex-row sm:items-start sm:justify-center"
                >
                  <PdfPageCanvas
                    page={p}
                    pageIndex={i}
                    zoom={zoom}
                    existingAnnotations={annotations.filter((a) => a.pageIndex === i)}
                    signatureDataUrl={activeSignature?.imageDataUrl ?? null}
                    searchHighlights={searchHighlightsByPage.get(i) ?? []}
                  />
                  <PdfPageCommentRail comments={textComments} railHeightPx={pageH} zoom={zoom} />
                </div>
              )
            })}
          </div>
        </div>
        {historyOpen && (
          <PdfVersionHistory
            pdfPath={path}
            vaultFs={vaultFs}
            onRestore={() => void loadPdf({ cancelled: false })}
          />
        )}
      </div>
      <SignaturePadDialog
        open={sigDialogOpen}
        onOpenChange={setSigDialogOpen}
        onSave={(url, name) => void handleNewSignature(url, name)}
      />
      <PdfFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        pdfBytes={rawPdfBytes}
        onSave={handleFormSave}
      />
      <PdfCommentDialog
        open={pendingPdfComment !== null}
        onOpenChange={(open) => {
          if (!open) setPendingPdfComment(null)
        }}
        pageLabel={pendingPdfComment ? `Page ${pendingPdfComment.pageIndex + 1}` : ''}
        onSubmit={handlePdfCommentSubmit}
      />
    </div>
  )
}
