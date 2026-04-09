import type { CanvasFile } from '@/types/canvas'

const MAX_HISTORY = 50

function cloneFile(file: CanvasFile): CanvasFile {
  return JSON.parse(JSON.stringify(file))
}

/**
 * Snapshot-based undo/redo stack for canvas operations.
 * Stores deep clones of the CanvasFile data model, capped at MAX_HISTORY.
 */
export class CanvasUndoStack {
  private past: CanvasFile[] = []
  private future: CanvasFile[] = []

  get canUndo(): boolean {
    return this.past.length > 0
  }

  get canRedo(): boolean {
    return this.future.length > 0
  }

  /** Save a snapshot of the current state before a mutation. */
  push(file: CanvasFile): void {
    this.past.push(cloneFile(file))
    if (this.past.length > MAX_HISTORY) {
      this.past.shift()
    }
    this.future = []
  }

  /**
   * Undo: returns the previous state to restore.
   * `current` is the current (about-to-be-replaced) state, which gets pushed to future.
   */
  undo(current: CanvasFile): CanvasFile | null {
    if (this.past.length === 0) return null
    this.future.push(cloneFile(current))
    return this.past.pop()!
  }

  /**
   * Redo: returns the next state to restore.
   * `current` is the current state, which gets pushed to past.
   */
  redo(current: CanvasFile): CanvasFile | null {
    if (this.future.length === 0) return null
    this.past.push(cloneFile(current))
    return this.future.pop()!
  }

  clear(): void {
    this.past = []
    this.future = []
  }
}
