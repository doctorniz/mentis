import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { PdfDocumentInfo, PdfAnnotation, Signature } from '@/types/pdf'
import { PdfTool } from '@/types/pdf'

/** Annotation ids pending save (Immer-friendly). */
export type DirtyAnnotationMap = Record<string, true>

interface PdfState {
  document: PdfDocumentInfo | null
  annotations: PdfAnnotation[]
  dirtyAnnotations: DirtyAnnotationMap
  activeTool: PdfTool
  /** Highlight rectangles (pastel swatches). */
  highlightColor: string
  /** Ink / pen strokes; separate so switching Highlight → Draw does not inherit yellow (P4). */
  drawColor: string
  /** FreeText box default colour; separate from highlight pastels (P14). */
  textColor: string
  strokeWidth: number
  currentPage: number
  zoom: number
  signatures: Signature[]
  hasUnsavedChanges: boolean
  hasSessionSnapshot: boolean
  /** Set when user clicks with Comment tool; viewer opens dialog then creates `PdfTextComment`. */
  pendingPdfComment: { pageIndex: number; anchorPdfX: number; anchorPdfY: number } | null

  setDocument: (doc: PdfDocumentInfo | null) => void
  /** @param options.fromLoader When true (hydrating from disk), do not mark dirty / unsaved. */
  addAnnotation: (annotation: PdfAnnotation, options?: { fromLoader?: boolean }) => void
  removeAnnotation: (id: string) => void
  updateAnnotation: (id: string, updates: Partial<PdfAnnotation>) => void
  setActiveTool: (tool: PdfTool) => void
  setHighlightColor: (color: string) => void
  setDrawColor: (color: string) => void
  setTextColor: (color: string) => void
  setStrokeWidth: (width: number) => void
  setCurrentPage: (page: number) => void
  setZoom: (zoom: number) => void
  addSignature: (signature: Signature) => void
  removeSignature: (id: string) => void
  markSaved: () => void
  setHasSessionSnapshot: (has: boolean) => void
  setPendingPdfComment: (pending: PdfState['pendingPdfComment']) => void
  reset: () => void
}

export const usePdfStore = create<PdfState>()(
  immer((set) => ({
    document: null,
    annotations: [],
    dirtyAnnotations: {},
    activeTool: PdfTool.Select,
    highlightColor: '#fff3bf',
    drawColor: '#000000',
    textColor: '#000000',
    strokeWidth: 2,
    currentPage: 0,
    zoom: 1,
    signatures: [],
    hasUnsavedChanges: false,
    hasSessionSnapshot: false,
    pendingPdfComment: null,

    setDocument: (doc) =>
      set((state) => {
        state.document = doc
        state.annotations = []
        state.dirtyAnnotations = {}
        state.currentPage = 0
        state.hasUnsavedChanges = false
        state.hasSessionSnapshot = false
        state.pendingPdfComment = null
      }),

    addAnnotation: (annotation, options) =>
      set((state) => {
        state.annotations.push(annotation)
        if (!options?.fromLoader) {
          state.dirtyAnnotations[annotation.id] = true
          state.hasUnsavedChanges = true
        }
      }),

    removeAnnotation: (id) =>
      set((state) => {
        state.annotations = state.annotations.filter((a) => a.id !== id)
        state.dirtyAnnotations[id] = true
        state.hasUnsavedChanges = true
      }),

    updateAnnotation: (id, updates) =>
      set((state) => {
        const annotation = state.annotations.find((a) => a.id === id)
        if (annotation) {
          Object.assign(annotation, updates)
          state.dirtyAnnotations[id] = true
          state.hasUnsavedChanges = true
        }
      }),

    setActiveTool: (tool) =>
      set((state) => {
        state.activeTool = tool
      }),

    setHighlightColor: (color) =>
      set((state) => {
        state.highlightColor = color
      }),

    setDrawColor: (color) =>
      set((state) => {
        state.drawColor = color
      }),

    setTextColor: (color) =>
      set((state) => {
        state.textColor = color
      }),

    setStrokeWidth: (width) =>
      set((state) => {
        state.strokeWidth = width
      }),

    setCurrentPage: (page) =>
      set((state) => {
        state.currentPage = page
      }),

    setZoom: (zoom) =>
      set((state) => {
        state.zoom = Math.max(0.25, Math.min(5, zoom))
      }),

    addSignature: (signature) =>
      set((state) => {
        state.signatures.push(signature)
      }),

    removeSignature: (id) =>
      set((state) => {
        state.signatures = state.signatures.filter((s) => s.id !== id)
      }),

    markSaved: () =>
      set((state) => {
        state.dirtyAnnotations = {}
        state.hasUnsavedChanges = false
      }),

    setHasSessionSnapshot: (has) =>
      set((state) => {
        state.hasSessionSnapshot = has
      }),

    setPendingPdfComment: (pending) =>
      set((state) => {
        state.pendingPdfComment = pending
      }),

    reset: () =>
      set((state) => {
        state.document = null
        state.annotations = []
        state.dirtyAnnotations = {}
        state.activeTool = PdfTool.Select
        state.highlightColor = '#fff3bf'
        state.drawColor = '#000000'
        state.textColor = '#000000'
        state.currentPage = 0
        state.zoom = 1
        state.hasUnsavedChanges = false
        state.hasSessionSnapshot = false
        state.pendingPdfComment = null
      }),
  })),
)
