import { useCanvasStore } from '@/stores/canvas'
import { encodeCanvasRegionSnapshot } from '@/lib/canvas/undo-manager'
import type { CanvasEngine } from '@/lib/canvas/engine'
import type { SnapshotRegion } from '@/types/canvas'

/**
 * Shared orchestration for selection MOVES, used by both drivers:
 * pointer drag (canvas-viewport) and arrow-key nudge (canvas-editor).
 * The pre-float readback lives on `engine.pendingSelectionCapture` so
 * either surface can commit a float the other one started.
 */

/** Intersect an (unclamped) rect with the canvas bounds. */
export function clampRegion(
  bounds: { x: number; y: number; width: number; height: number },
  canvasW: number,
  canvasH: number,
): SnapshotRegion | null {
  const x = Math.max(0, bounds.x)
  const y = Math.max(0, bounds.y)
  const width = Math.min(bounds.x + bounds.width, canvasW) - x
  const height = Math.min(bounds.y + bounds.height, canvasH) - y
  if (width <= 0 || height <= 0) return null
  return { x, y, width, height }
}

/** Smallest rect containing both rects. */
function unionRect(a: SnapshotRegion, b: SnapshotRegion): SnapshotRegion {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  }
}

/**
 * Read the full active layer back BEFORE beginMove erases the source
 * region, and park it on the engine for the eventual commit. Returns
 * false when there is nothing to capture (no layer / extract failure).
 */
export function captureSelectionMoveStart(engine: CanvasEngine): boolean {
  const layerId = engine.layerManager.activeLayerId
  const canvas = layerId ? engine.layerManager.extractLayerCanvas(layerId) : null
  if (!layerId || !canvas) return false
  engine.pendingSelectionCapture = { layerId, canvas }
  return true
}

/**
 * Commit the in-flight float (however it was driven) and push one
 * region-scoped undo entry covering the source∪dest union. No-ops when
 * nothing is floating — safe to call from a stale timer.
 */
export function commitSelectionMove(engine: CanvasEngine): void {
  const pre = engine.pendingSelectionCapture
  engine.pendingSelectionCapture = null

  const moved = engine.selectionTool.commitMove(engine.viewportController.state.zoom)
  if (!moved) return
  engine.render()

  if (pre) {
    const union = clampRegion(
      unionRect(moved.sourceRect, moved.destRect),
      engine.width,
      engine.height,
    )
    if (union) {
      const pending = encodeCanvasRegionSnapshot(pre.layerId, pre.canvas, union)
      engine.undoPushChain = engine.undoPushChain.then(async () => {
        const snapshot = await pending
        if (snapshot) {
          engine.undoManager.push({
            kind: 'stroke',
            snapshots: [snapshot],
            description: 'Move selection',
          })
        }
        const store = useCanvasStore.getState()
        store.setUndoState(engine.undoManager.canUndo, engine.undoManager.canRedo)
      })
    }
  }
  useCanvasStore.getState().markDirty()
}
