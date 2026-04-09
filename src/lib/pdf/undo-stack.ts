const MAX_HISTORY = 20

/**
 * Snapshot-based undo/redo stack for PDF page operations.
 * Stores defensive copies of raw PDF bytes, capped at MAX_HISTORY.
 * Lower limit than canvas (50) because PDF byte arrays are typically larger.
 */
export class PdfUndoStack {
  private past: Uint8Array[] = []
  private future: Uint8Array[] = []

  get canUndo(): boolean {
    return this.past.length > 0
  }

  get canRedo(): boolean {
    return this.future.length > 0
  }

  push(bytes: Uint8Array): void {
    this.past.push(bytes.slice())
    if (this.past.length > MAX_HISTORY) this.past.shift()
    this.future = []
  }

  undo(current: Uint8Array): Uint8Array | null {
    if (!this.past.length) return null
    this.future.push(current.slice())
    return this.past.pop()!
  }

  redo(current: Uint8Array): Uint8Array | null {
    if (!this.future.length) return null
    this.past.push(current.slice())
    return this.future.pop()!
  }

  clear(): void {
    this.past = []
    this.future = []
  }
}
