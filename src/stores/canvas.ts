import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { CanvasFile, CanvasViewport } from '@/types/canvas'

/** Selected node ids as a map (Immer-friendly). */
export type SelectedNodeIdsMap = Record<string, true>

/** Toolbar tools (sticky/connect creation removed from UI; existing nodes still load). */
export type CanvasActiveTool = 'select' | 'draw' | 'text' | 'erase'

interface CanvasState {
  file: CanvasFile | null
  path: string | null
  viewport: CanvasViewport
  selectedNodeIds: SelectedNodeIdsMap
  activeTool: CanvasActiveTool
  strokeColor: string
  strokeWidth: number
  strokeOpacity: number
  isDirty: boolean
  /** Registered by the active CanvasEditor; syncs Fabric state to disk synchronously. */
  _flushSave: (() => Promise<void>) | null

  setFile: (file: CanvasFile, path: string) => void
  setViewport: (viewport: CanvasViewport) => void
  setSelectedNodes: (ids: Iterable<string>) => void
  setActiveTool: (tool: CanvasState['activeTool']) => void
  setStrokeColor: (color: string) => void
  setStrokeWidth: (width: number) => void
  setStrokeOpacity: (opacity: number) => void
  markDirty: () => void
  markSaved: () => void
  registerFlushSave: (fn: (() => Promise<void>) | null) => void
  reset: () => void
}

function idsToMap(ids: Iterable<string>): SelectedNodeIdsMap {
  const m: SelectedNodeIdsMap = {}
  for (const id of ids) {
    m[id] = true
  }
  return m
}

export const useCanvasStore = create<CanvasState>()(
  immer((set) => ({
    file: null,
    path: null,
    viewport: { x: 0, y: 0, zoom: 1 },
    selectedNodeIds: {},
    activeTool: 'draw',
    strokeColor: '#212529',
    strokeWidth: 3,
    strokeOpacity: 1,
    isDirty: false,
    _flushSave: null,

    setFile: (file, path) =>
      set((state) => {
        state.file = file
        state.path = path
        state.isDirty = false
      }),

    setViewport: (viewport) =>
      set((state) => {
        state.viewport = viewport
      }),

    setSelectedNodes: (ids) =>
      set((state) => {
        state.selectedNodeIds = idsToMap(ids)
      }),

    setActiveTool: (tool) =>
      set((state) => {
        state.activeTool = tool
      }),

    setStrokeColor: (color) =>
      set((state) => {
        state.strokeColor = color
      }),

    setStrokeWidth: (width) =>
      set((state) => {
        state.strokeWidth = width
      }),

    setStrokeOpacity: (opacity) =>
      set((state) => {
        state.strokeOpacity = Math.max(0, Math.min(1, opacity))
      }),

    markDirty: () =>
      set((state) => {
        state.isDirty = true
      }),

    markSaved: () =>
      set((state) => {
        state.isDirty = false
      }),

    registerFlushSave: (fn) =>
      set((state) => {
        state._flushSave = fn as never
      }),

    /** Clear file-bound state when leaving the canvas editor; keep tool + brush prefs (LAUNCH C2). */
    reset: () =>
      set((state) => {
        state.file = null
        state.path = null
        state.selectedNodeIds = {}
        state.isDirty = false
        state._flushSave = null
      }),
  })),
)
