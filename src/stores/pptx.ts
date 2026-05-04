import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

interface PptxState {
  /** Whether the file is currently loading / parsing */
  isLoading: boolean
  /** Whether the presentation has unsaved changes */
  hasUnsavedChanges: boolean
  /** Error message if loading failed */
  error: string | null

  /* Actions */
  setLoading: (v: boolean) => void
  markDirty: () => void
  markSaved: () => void
  setError: (msg: string | null) => void
  reset: () => void
}

export const usePptxStore = create<PptxState>()(
  immer((set) => ({
    isLoading: false,
    hasUnsavedChanges: false,
    error: null,

    setLoading: (v) =>
      set((s) => {
        s.isLoading = v
      }),
    markDirty: () =>
      set((s) => {
        s.hasUnsavedChanges = true
      }),
    markSaved: () =>
      set((s) => {
        s.hasUnsavedChanges = false
      }),
    setError: (msg) =>
      set((s) => {
        s.error = msg
      }),
    reset: () =>
      set((s) => {
        s.isLoading = false
        s.hasUnsavedChanges = false
        s.error = null
      }),
  })),
)
