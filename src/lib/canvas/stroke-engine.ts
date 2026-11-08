import type { StrokePoint, BrushSettings } from '@/types/canvas'
import { interpolateStroke, tiltShape, distanceBetween } from '@/lib/canvas/math'
import {
  DEFAULT_PRESSURE,
  DEFAULT_TAPER,
  shapePressure,
  smoothPressure,
  taperLength,
  taperScale,
} from '@/lib/canvas/brush-shaping'
import type { BrushSystem } from '@/lib/canvas/brush-system'
import type { LayerManager } from '@/lib/canvas/layer-manager'

/**
 * Processes pointer events into strokes.
 *
 * On pointerdown: begins a new stroke, stamps the initial point.
 * On pointermove: collects points, interpolates via Catmull-Rom, stamps.
 * On pointerup:
 *   - Normal strokes: commit the scratchpad to the active layer.
 *   - Eraser strokes: no-op — stamps were already rendered straight into
 *     the active layer with blendMode='erase'.
 *
 * Why does the eraser bypass the scratchpad?
 * The scratchpad pattern works for *additive* ink (accumulate stamps into
 * an RT, composite once with normal blend so opacity is bounded to the
 * stroke's settings). Erase semantics are fundamentally different — each
 * stamp must subtract alpha from pixels already on the layer. Rendering
 * Graphics → layer RT with `blendMode='erase'` does exactly that.
 * Applying `'erase'` at commit time via the scratchpad Sprite was
 * unreliable in practice (appeared as translucent grey paint on some
 * backends because the scratchpad RT stores premultiplied alpha and the
 * sprite's blend pass doesn't always respect it). Direct-to-layer erase
 * is the canonical Pixi path and also gives the user real-time feedback
 * as pixels disappear.
 */
export class StrokeEngine {
  private layerManager: LayerManager
  private brushSystem: BrushSystem
  private currentPoints: StrokePoint[] = []
  private _isDrawing = false
  private _isEraser = false
  /** The brush the stroke began with. */
  private _settings: BrushSettings | null = null
  /** How far along the stroke its taper runs, in pixels; 0 when it has none. */
  private _taperLen = 0

  /** Dirty-rect accumulator for the in-progress stroke (canvas-space). */
  private boundsMinX = Infinity
  private boundsMinY = Infinity
  private boundsMaxX = -Infinity
  private boundsMaxY = -Infinity

  /**
   * Where the previous stroke ended (canvas-space). Shift+click begins
   * the next stroke with a straight connecting line from here — the
   * Photoshop convention for ruled lines.
   */
  private _lastStrokeEnd: StrokePoint | null = null

  /** Called when a stroke is committed to the layer. */
  onStrokeCommitted: (() => void) | null = null

  constructor(layerManager: LayerManager, brushSystem: BrushSystem) {
    this.layerManager = layerManager
    this.brushSystem = brushSystem
  }

  get isDrawing(): boolean {
    return this._isDrawing
  }

  get isEraserStroke(): boolean {
    return this._isDrawing && this._isEraser
  }

  /**
   * Bounding box of everything the in-progress (or just-ended) stroke
   * may have touched, padded by the brush radius plus a small safety
   * margin. Unclamped — callers intersect it with the canvas rect.
   * Null when no points were tracked.
   */
  getStrokeBounds(): { x: number; y: number; width: number; height: number } | null {
    if (this.boundsMinX === Infinity) return null
    return {
      x: Math.floor(this.boundsMinX),
      y: Math.floor(this.boundsMinY),
      width: Math.ceil(this.boundsMaxX - this.boundsMinX),
      height: Math.ceil(this.boundsMaxY - this.boundsMinY),
    }
  }

  private trackPoint(point: StrokePoint, settings: BrushSettings): void {
    // Full radius regardless of pressure/hardness — soft masks bleed to
    // the edge of the stamp quad; +4 covers antialiasing. A tilted pen
    // stretches the tip along its lean.
    const pad = (settings.size / 2) * tiltShape(point.tiltX, point.tiltY).stretch + 4
    this.boundsMinX = Math.min(this.boundsMinX, point.x - pad)
    this.boundsMinY = Math.min(this.boundsMinY, point.y - pad)
    this.boundsMaxX = Math.max(this.boundsMaxX, point.x + pad)
    this.boundsMaxY = Math.max(this.boundsMaxY, point.y + pad)
  }

  private resetBounds(): void {
    this.boundsMinX = Infinity
    this.boundsMinY = Infinity
    this.boundsMaxX = -Infinity
    this.boundsMaxY = -Infinity
  }

  /**
   * Returns the RenderTexture that stamps for the current stroke should
   * render into: the active layer directly when erasing, or the shared
   * scratchpad otherwise. Returns null if there is no active layer.
   */
  private getStrokeTarget() {
    if (this._isEraser) {
      const active = this.layerManager.getActiveLayer()
      return active ? active.renderTexture : null
    }
    return this.layerManager.getScratchpadRT()
  }

  /** A stroke's taper at `along` pixels in; `total` once the stroke has ended. */
  private scaleAt(along: number, total?: number): number {
    return this._taperLen > 0 ? taperScale(along, this._taperLen, total) : 1
  }

  /** Stamp spacing: even, or closer where a taper makes the stamps small. */
  private spacing(settings: BrushSettings, total?: number): number | ((along: number) => number) {
    const base = Math.max(1, settings.size * settings.spacing)
    if (this._taperLen <= 0) return base
    return (along) => Math.max(0.75, base * Math.max(0.3, this.scaleAt(along, total)))
  }

  /**
   * The stroke ended: draw it again with its end tapered too, now that its
   * length is known, in place of what the scratchpad has. The brush stamps in
   * batches so a long stroke does not hold every stamp's sprite at once.
   */
  private redrawTapered(): void {
    const settings = this._settings
    const points = this.currentPoints
    const target = this.layerManager.getScratchpadRT()
    if (!settings || points.length === 0 || !target) return
    const total = points[points.length - 1]?.along ?? 0
    const stamps = interpolateStroke(points, this.spacing(settings, total))
    for (const stamp of stamps) stamp.scale = this.scaleAt(stamp.along ?? 0, total)
    this.layerManager.clearScratchpad()
    this.layerManager.setScratchpadOpacity(settings.opacity)
    const BATCH = 512
    for (let i = 0; i < stamps.length; i += BATCH) {
      this.brushSystem.renderStamps(stamps.slice(i, i + BATCH), settings, target, false)
    }
  }

  beginStroke(
    point: StrokePoint,
    settings: BrushSettings,
    isEraser: boolean,
    connectToLast = false,
  ): void {
    const active = this.layerManager.getActiveLayer()
    if (!active || active.locked) return

    this._isDrawing = true
    this._isEraser = isEraser
    this._settings = settings
    // Taper and the pressure curve are for ink; the eraser and a ruled line
    // from the last stroke (which has no points to redraw) keep to the raw input.
    this._taperLen =
      isEraser || connectToLast ? 0 : taperLength(settings.size, settings.taper ?? DEFAULT_TAPER)
    if (!isEraser) {
      point = {
        ...point,
        pressure: shapePressure(point.pressure, settings.pressure ?? DEFAULT_PRESSURE),
        along: 0,
      }
    }
    this.currentPoints = [point]
    this.resetBounds()
    this.trackPoint(point, settings)

    const target = this.getStrokeTarget()
    if (!target) return

    if (!isEraser) {
      // Stroke opacity lives on the scratchpad sprite, not the stamps —
      // see BrushSystem.renderBrushStamps for why.
      this.layerManager.setScratchpadOpacity(settings.opacity)
    }

    // Shift+click: rule a straight line from the previous stroke's end.
    if (connectToLast && this._lastStrokeEnd) {
      const from = this._lastStrokeEnd
      this.trackPoint(from, settings)
      const spacingPx = Math.max(1, settings.size * settings.spacing)
      const stamps = interpolateStroke([from, point], spacingPx)
      this.brushSystem.renderStamps(stamps, settings, target, isEraser)
      return
    }

    if (this._taperLen > 0) {
      const stamp = { x: point.x, y: point.y, pressure: point.pressure, scale: this.scaleAt(0) }
      this.brushSystem.renderStamps([stamp], settings, target, false)
      return
    }
    this.brushSystem.stampAt(point.x, point.y, point.pressure, settings, target, isEraser)
  }

  continueStroke(point: StrokePoint, settings: BrushSettings): void {
    if (!this._isDrawing) return

    // Optional stabilizer: exponential moving average toward the raw
    // pointer position. Higher smoothing = the stroke trails the cursor
    // more, ironing out hand jitter.
    const smoothing = settings.smoothing ?? 0
    if (smoothing > 0 && this.currentPoints.length > 0) {
      const prev = this.currentPoints[this.currentPoints.length - 1]
      const follow = 1 - 0.85 * Math.min(1, smoothing)
      point = {
        ...point,
        x: prev.x + (point.x - prev.x) * follow,
        y: prev.y + (point.y - prev.y) * follow,
      }
    }

    if (!this._isEraser && this.currentPoints.length > 0) {
      const prev = this.currentPoints[this.currentPoints.length - 1]
      const curve = settings.pressure ?? DEFAULT_PRESSURE
      point = {
        ...point,
        pressure: smoothPressure(prev.pressure, shapePressure(point.pressure, curve)),
        along: (prev.along ?? 0) + distanceBetween(prev, point),
      }
    }

    this.currentPoints.push(point)
    this.trackPoint(point, settings)

    // Interpolate the last few points and render stamps.
    // We use the last 4 points for Catmull-Rom context.
    const recent = this.currentPoints.slice(-4)
    if (recent.length < 2) return

    const stamps = interpolateStroke(recent, this.spacing(settings))
    if (this._taperLen > 0) {
      for (const stamp of stamps) stamp.scale = this.scaleAt(stamp.along ?? 0)
    }

    // Skip the first stamp since it was already rendered by the previous
    // call (beginStroke or the prior continueStroke).
    const newStamps = stamps.slice(1)
    if (newStamps.length === 0) return

    const target = this.getStrokeTarget()
    if (!target) return

    this.brushSystem.renderStamps(newStamps, settings, target, this._isEraser)
  }

  endStroke(): void {
    if (!this._isDrawing) return
    this._isDrawing = false

    this._lastStrokeEnd = this.currentPoints[this.currentPoints.length - 1] ?? null

    if (!this._isEraser) {
      if (this._taperLen > 0) this.redrawTapered()
      // Normal strokes: commit the accumulated scratchpad to the active
      // layer with normal blend.
      this.layerManager.commitScratchpad(false)
    }
    // Eraser strokes have already been rendered directly into the active
    // layer — nothing to commit, nothing to clear.

    this.currentPoints = []
    this._isEraser = false
    this._settings = null
    this._taperLen = 0

    this.onStrokeCommitted?.()
  }

  /**
   * Abort the in-progress stroke without committing it.
   *
   * Brush strokes only live in the scratchpad until commit, so
   * discarding the scratchpad fully reverts them. Eraser stamps have
   * already subtracted alpha from the layer itself and CANNOT be
   * reverted here — the return value tells the caller the layer was
   * mutated so it can restore from the pre-stroke undo snapshot (see
   * `CanvasEngine.cancelActiveStroke`).
   *
   * @returns true when layer pixels were already mutated (eraser).
   */
  cancelStroke(): boolean {
    if (!this._isDrawing) return false
    this._isDrawing = false

    const wasEraser = this._isEraser
    if (!wasEraser) {
      this.layerManager.clearScratchpad()
    }
    this.currentPoints = []
    this._isEraser = false
    this._settings = null
    this._taperLen = 0
    return wasEraser
  }
}
