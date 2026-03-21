import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { PdfDocumentInfo, PdfAnnotation, Signature } from '@/types/pdf'
import { PdfTool } from '@/types/pdf'

interface PdfState {
  document: PdfDocumentInfo | null
  annotations: PdfAnnotation[]
  dirtyAnnotations: Set<string>
  activeTool: PdfTool
  activeColor: string
  strokeWidth: number
  currentPage: number
  zoom: number
  signatures: Signature[]
  hasUnsavedChanges: boolean
  hasSessionSnapshot: boolean

  setDocument: (doc: PdfDocumentInfo | null) => void
  addAnnotation: (annotation: PdfAnnotation) => void
  removeAnnotation: (id: string) => void
  updateAnnotation: (id: string, updates: Partial<PdfAnnotation>) => void
  setActiveTool: (tool: PdfTool) => void
  setActiveColor: (color: string) => void
  setStrokeWidth: (width: number) => void
  setCurrentPage: (page: number) => void
  setZoom: (zoom: number) => void
  addSignature: (signature: Signature) => void
  removeSignature: (id: string) => void
  markSaved: () => void
  setHasSessionSnapshot: (has: boolean) => void
  reset: () => void
}

export const usePdfStore = create<PdfState>()(
  immer((set) => ({
    document: null,
    annotations: [],
    dirtyAnnotations: new Set<string>(),
    activeTool: PdfTool.Select,
    activeColor: '#fff3bf',
    strokeWidth: 2,
    currentPage: 0,
    zoom: 1,
    signatures: [],
    hasUnsavedChanges: false,
    hasSessionSnapshot: false,

    setDocument: (doc) =>
      set((state) => {
        state.document = doc
        state.annotations = []
        state.dirtyAnnotations = new Set()
        state.currentPage = 0
        state.hasUnsavedChanges = false
        state.hasSessionSnapshot = false
      }),

    addAnnotation: (annotation) =>
      set((state) => {
        state.annotations.push(annotation)
        state.dirtyAnnotations.add(annotation.id)
        state.hasUnsavedChanges = true
      }),

    removeAnnotation: (id) =>
      set((state) => {
        state.annotations = state.annotations.filter((a) => a.id !== id)
        state.dirtyAnnotations.add(id)
        state.hasUnsavedChanges = true
      }),

    updateAnnotation: (id, updates) =>
      set((state) => {
        const annotation = state.annotations.find((a) => a.id === id)
        if (annotation) {
          Object.assign(annotation, updates)
          state.dirtyAnnotations.add(id)
          state.hasUnsavedChanges = true
        }
      }),

    setActiveTool: (tool) =>
      set((state) => {
        state.activeTool = tool
      }),

    setActiveColor: (color) =>
      set((state) => {
        state.activeColor = color
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
        state.dirtyAnnotations = new Set()
        state.hasUnsavedChanges = false
      }),

    setHasSessionSnapshot: (has) =>
      set((state) => {
        state.hasSessionSnapshot = has
      }),

    reset: () =>
      set((state) => {
        state.document = null
        state.annotations = []
        state.dirtyAnnotations = new Set()
        state.activeTool = PdfTool.Select
        state.currentPage = 0
        state.zoom = 1
        state.hasUnsavedChanges = false
        state.hasSessionSnapshot = false
      }),
  })),
)
