import type {
  UndoEntry,
  StrokeUndoEntry,
  RemoveLayerUndoEntry,
  ReorderLayersUndoEntry,
  MergeLayersUndoEntry,
  LayerSnapshot,
  SnapshotRegion,
  CanvasLayerData,
} from '@/types/canvas'
import type { LayerManager } from '@/lib/canvas/layer-manager'
import { MAX_UNDO_ENTRIES } from '@/lib/canvas/constants'

/**
 * Encode a rect of an already-extracted layer canvas into a region
 * snapshot. Used by the eraser undo path: the full pre-stroke readback
 * happens on pointerdown (the region isn't known yet), and once the
 * stroke ends only its dirty rect is cropped + PNG-encoded for storage.
 * Returns null when the rect doesn't intersect the source canvas.
 */
export function encodeCanvasRegionSnapshot(
  layerId: string,
  source: HTMLCanvasElement,
  region: SnapshotRegion,
): Promise<LayerSnapshot | null> {
  const x = Math.max(0, region.x)
  const y = Math.max(0, region.y)
  const width = Math.min(region.x + region.width, source.width) - x
  const height = Math.min(region.y + region.height, source.height) - y
  if (width <= 0 || height <= 0) return Promise.resolve(null)

  const crop = document.createElement('canvas')
  crop.width = width
  crop.height = height
  const ctx = crop.getContext('2d')
  if (!ctx) return Promise.resolve(null)
  ctx.drawImage(source, x, y, width, height, 0, 0, width, height)

  return new Promise((resolve) => {
    crop.toBlob(
      (blob) => resolve(blob ? { layerId, blob, region: { x, y, width, height } } : null),
      'image/png',
    )
  })
}

/**
 * Per-layer undo/redo.
 *
 * The stack holds a discriminated-union of entry kinds — each kind has
 * its own capture / restore semantics:
 *
 *   - `stroke`       → replace pixels on a set of layers by blitting a
 *                      previously-captured base64 PNG back into each
 *                      layer's RenderTexture.
 *   - `remove-layer` → re-create a deleted layer in its original stack
 *                      position with full metadata + pixel data.
 *
 * Pushing a new entry always clears the redo stack (standard undo
 * semantics — branching history is explicitly not supported).
 */
export class UndoManager {
  private layerManager: LayerManager
  private past: UndoEntry[] = []
  private future: UndoEntry[] = []

  constructor(layerManager: LayerManager) {
    this.layerManager = layerManager
  }

  get canUndo(): boolean {
    return this.past.length > 0
  }

  get canRedo(): boolean {
    return this.future.length > 0
  }

  /**
   * Snapshot the active layer before a destructive stroke operation.
   *
   * The GPU readback happens SYNCHRONOUSLY inside this call — only the
   * PNG encode is deferred into the returned promise. Callers can
   * therefore start mutating the layer the moment this returns (the
   * eraser subtracts alpha from the layer on the very first stamp) and
   * still get a faithful pre-stroke snapshot.
   *
   * Stored as a PNG Blob — see `LayerSnapshot` for why we prefer this
   * over a base64 string for undo storage.
   */
  snapshotActiveLayer(): Promise<LayerSnapshot | null> {
    const active = this.layerManager.getActiveLayer()
    if (!active) return Promise.resolve(null)
    return this.captureSnapshot(active.id)
  }

  /**
   * Dirty-region variant of `snapshotActiveLayer` — same synchronous
   * readback guarantee, but only for the given rect. Used by the brush
   * undo path at pointerup, where the stroke's bounds are known and the
   * layer hasn't been mutated yet (the stroke still lives in the
   * scratchpad until commit).
   */
  snapshotActiveLayerRegion(region: SnapshotRegion): Promise<LayerSnapshot | null> {
    const active = this.layerManager.getActiveLayer()
    if (!active) return Promise.resolve(null)
    return this.captureSnapshot(active.id, region)
  }

  /** Sync readback (optionally region-scoped) + deferred PNG encode. */
  private captureSnapshot(layerId: string, region?: SnapshotRegion): Promise<LayerSnapshot | null> {
    const canvas = this.layerManager.extractLayerCanvas(layerId, region)
    if (!canvas) return Promise.resolve(null)
    return new Promise<LayerSnapshot | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob ? { layerId, blob, region } : null), 'image/png')
    })
  }

  /** Push an entry after a destructive operation completes. */
  push(entry: UndoEntry): void {
    this.past.push(entry)
    if (this.past.length > MAX_UNDO_ENTRIES) {
      this.past.shift()
    }
    this.future = []
  }

  /** Undo: reverse the last entry and move its redo mirror onto `future`. */
  async undo(): Promise<boolean> {
    const entry = this.past.pop()
    if (!entry) return false

    const redo = await this.applyReverse(entry)
    if (redo) this.future.push(redo)
    return true
  }

  /** Redo: reverse the last undone entry and move its undo mirror back. */
  async redo(): Promise<boolean> {
    const entry = this.future.pop()
    if (!entry) return false

    const undo = await this.applyReverse(entry)
    if (undo) this.past.push(undo)
    return true
  }

  clear(): void {
    this.past = []
    this.future = []
  }

  /**
   * Hand the stacks over for module-scope retention across editor
   * unmounts (tab switches destroy the engine and everything in it).
   * Snapshots are Blobs — off-heap, so a parked stack is cheap to keep.
   */
  exportState(): { past: UndoEntry[]; future: UndoEntry[] } {
    return { past: [...this.past], future: [...this.future] }
  }

  /**
   * Restore stacks previously exported for this canvas path. Layer ids
   * come from the file, so entries stay addressable across mounts. If
   * the file changed on disk in between (e.g. sync), a restored entry
   * simply rewrites the pixels it recorded — same semantics as undoing
   * past an external edit within one session.
   */
  importState(state: { past: UndoEntry[]; future: UndoEntry[] }): void {
    this.past = [...state.past]
    this.future = [...state.future]
  }

  /**
   * Reverse a single entry and return the entry that reverses *that*.
   * This symmetry is what makes undo/redo work from the same primitive —
   * undoing a stroke produces a stroke entry (with the previous current
   * pixels) that can redo the stroke, and undoing a layer deletion
   * produces a layer deletion entry that can redo the deletion.
   */
  private async applyReverse(entry: UndoEntry): Promise<UndoEntry | null> {
    switch (entry.kind) {
      case 'stroke':
        return this.reverseStroke(entry)
      case 'remove-layer':
        return this.reverseRemoveLayer(entry)
      case 'reorder-layers':
        return this.reverseReorder(entry)
      case 'merge-layers':
        return this.reverseMergeLayers(entry)
      default: {
        const _exhaustive: never = entry
        void _exhaustive
        return null
      }
    }
  }

  /**
   * Stroke reversal:
   * 1. Capture the current pixels of each affected layer (→ mirror entry).
   * 2. Restore the snapshot pixels back into each layer.
   *
   * The capture step tolerates partial failure — if GPU extract fails for
   * a given layer we simply skip its mirror snapshot rather than aborting
   * the undo.
   *
   * Snapshots are stored as Blobs; `extractLayerBlob` returns `null` on
   * renderer errors (no `lastSavedBase64`-style fallback for the Blob
   * path — the fallback lives on the base64 path and backs the disk
   * serializer, not undo). A missing mirror means a second undo of the
   * same entry would be a no-op, which is acceptable degradation.
   */
  private async reverseStroke(entry: StrokeUndoEntry): Promise<StrokeUndoEntry> {
    // Mirror-capture the same rect the snapshot covers — a region entry's
    // redo only needs the pixels its undo is about to overwrite.
    const mirror: LayerSnapshot[] = []
    for (const snap of entry.snapshots) {
      const current = await this.captureSnapshot(snap.layerId, snap.region)
      if (current) mirror.push(current)
    }

    for (const snap of entry.snapshots) {
      if (snap.region) {
        await this.layerManager.restoreLayerRegionFromBlob(snap.layerId, snap.blob, snap.region)
      } else {
        await this.layerManager.restoreLayerFromBlob(snap.layerId, snap.blob)
      }
    }

    return { kind: 'stroke', snapshots: mirror, description: entry.description }
  }

  /**
   * remove-layer reversal has two directions:
   *
   * A. Undoing a deletion = layer is currently gone, we need to bring it
   *    back. The mirror is the same data → a `remove-layer` entry that,
   *    when reversed, will delete it again (redo).
   *
   * B. Redoing a deletion = layer currently exists, we need to delete it
   *    again. We capture its current state (pixels may have changed
   *    after undo, but not in practice since undo restored it atomically)
   *    and then call removeLayer. The mirror is a new `remove-layer`
   *    entry that will bring it back when undone.
   *
   * Distinguishing A vs B: check whether the layer currently exists.
   */
  private async reverseRemoveLayer(
    entry: RemoveLayerUndoEntry,
  ): Promise<RemoveLayerUndoEntry | null> {
    const existing = this.layerManager.getLayer(entry.layerData.id)

    if (!existing) {
      // Direction A: bring the layer back at its original index.
      await this.layerManager.insertLayerFromData(entry.layerData, entry.index)
      if (entry.wasActive) {
        this.layerManager.setActiveLayer(entry.layerData.id)
      }
      return {
        kind: 'remove-layer',
        description: entry.description,
        layerData: entry.layerData,
        index: entry.index,
        wasActive: entry.wasActive,
      }
    }

    // Direction B: capture fresh data, then remove. Fresh capture is
    // important — a user could have edited the restored layer and then
    // hit Redo, in which case their edits would otherwise be lost.
    const fresh: CanvasLayerData | null = await this.layerManager.captureLayerData(
      entry.layerData.id,
    )
    this.layerManager.removeLayer(entry.layerData.id)

    return {
      kind: 'remove-layer',
      description: entry.description,
      layerData: fresh ?? entry.layerData,
      index: entry.index,
      wasActive: entry.wasActive,
    }
  }

  /**
   * merge-layers reversal, mirroring remove-layer's two directions:
   *
   * A. Undoing a merge = the source layer is gone and the target holds
   *    the merged pixels. Restore the target's pre-merge snapshot and
   *    re-create the source at its old index.
   *
   * B. Redoing a merge = the source exists again. Capture fresh
   *    pre-merge state (target pixels + source data) for the mirror,
   *    then re-merge.
   */
  private async reverseMergeLayers(
    entry: MergeLayersUndoEntry,
  ): Promise<MergeLayersUndoEntry | null> {
    const sourceExists = this.layerManager.getLayer(entry.sourceLayerData.id)

    if (!sourceExists) {
      // Direction A: un-merge.
      await this.layerManager.restoreLayerFromBlob(entry.targetLayerId, entry.targetSnapshot)
      await this.layerManager.insertLayerFromData(entry.sourceLayerData, entry.sourceIndex)
      if (entry.sourceWasActive) {
        this.layerManager.setActiveLayer(entry.sourceLayerData.id)
      }
      return { ...entry }
    }

    // Direction B: re-merge with freshly captured pre-merge state.
    const freshTarget = await this.layerManager.extractLayerBlob(entry.targetLayerId)
    const freshSource = await this.layerManager.captureLayerData(entry.sourceLayerData.id)
    this.layerManager.mergeLayerDown(entry.sourceLayerData.id)

    return {
      ...entry,
      sourceLayerData: freshSource ?? entry.sourceLayerData,
      targetSnapshot: freshTarget ?? entry.targetSnapshot,
    }
  }

  /**
   * reorder-layers reversal is pure symmetry: apply `before` and return a
   * new entry with `before` and `after` swapped so redo re-applies the
   * original reorder.
   *
   * No pixel work is involved — `reorderLayers` is a stack-order mutation
   * only. If the id set has drifted (e.g. a layer was deleted via a
   * separate undo path since this entry was pushed), `reorderLayers`
   * silently no-ops and we return the swapped mirror anyway. That is
   * intentional: the mirror's `before` array still reflects the state we
   * *expected* to see, so hitting redo after an in-between deletion is a
   * no-op instead of a crash.
   */
  private reverseReorder(entry: ReorderLayersUndoEntry): ReorderLayersUndoEntry {
    this.layerManager.reorderLayers(entry.before)
    return {
      kind: 'reorder-layers',
      description: entry.description,
      before: entry.after,
      after: entry.before,
    }
  }
}
