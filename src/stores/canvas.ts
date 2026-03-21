import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { CanvasFile, CanvasViewport } from '@/types/canvas'

interface CanvasState {
  file: CanvasFile | null
  path: string | null
  viewport: CanvasViewport
  selectedNodeIds: Set<string>
  activeTool: 'select' | 'draw' | 'text' | 'sticky' | 'connect' | 'erase'
  strokeColor: string
  strokeWidth: number
  isDirty: boolean

  setFile: (file: CanvasFile, path: string) => void
  setViewport: (viewport: CanvasViewport) => void
  setSelectedNodes: (ids: Set<string>) => void
  setActiveTool: (tool: CanvasState['activeTool']) => void
  setStrokeColor: (color: string) => void
  setStrokeWidth: (width: number) => void
  markDirty: () => void
  markSaved: () => void
  reset: () => void
}

export const useCanvasStore = create<CanvasState>()(
  immer((set) => ({
    file: null,
    path: null,
    viewport: { x: 0, y: 0, zoom: 1 },
    selectedNodeIds: new Set<string>(),
    activeTool: 'select',
    strokeColor: '#212529',
    strokeWidth: 2,
    isDirty: false,

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
        state.selectedNodeIds = ids
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

    markDirty: () =>
      set((state) => {
        state.isDirty = true
      }),

    markSaved: () =>
      set((state) => {
        state.isDirty = false
      }),

    reset: () =>
      set((state) => {
        state.file = null
        state.path = null
        state.selectedNodeIds = new Set()
        state.activeTool = 'select'
        state.isDirty = false
      }),
  })),
)
