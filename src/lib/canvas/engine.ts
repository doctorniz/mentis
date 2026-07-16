import { Application, Container } from 'pixi.js'
import { LayerManager } from '@/lib/canvas/layer-manager'
import { StrokeEngine } from '@/lib/canvas/stroke-engine'
import { BrushSystem } from '@/lib/canvas/brush-system'
import { ViewportController } from '@/lib/canvas/viewport-controller'
import { UndoManager } from '@/lib/canvas/undo-manager'
import { SelectionTool } from '@/lib/canvas/selection'
import {
  DEFAULT_CANVAS_WIDTH,
  DEFAULT_CANVAS_HEIGHT,
  DEFAULT_BACKGROUND,
  MAX_CANVAS_DIMENSION,
} from '@/lib/canvas/constants'

/**
 * CanvasEngine — the orchestrator for the PixiJS drawing engine.
 *
 * Owns the PixiJS Application, manages all subsystems.
 * This class has NO React dependencies — it is held in a `useRef`
 * by the React component and initialized/destroyed via effects.
 */
export class CanvasEngine {
  app!: Application
  layerManager!: LayerManager
  strokeEngine!: StrokeEngine
  brushSystem!: BrushSystem
  viewportController!: ViewportController
  undoManager!: UndoManager
  selectionTool!: SelectionTool

  private viewport!: Container
  private _initialized = false
  private _width = DEFAULT_CANVAS_WIDTH
  private _height = DEFAULT_CANVAS_HEIGHT
  private _background = DEFAULT_BACKGROUND

  /**
   * Fired when the canvas dimensions change (load / auto-expansion) so the
   * DOM "paper" backdrop (drawn behind the transparent Pixi canvas by
   * CanvasViewport) can resize to match. The transform itself is tracked
   * separately via `viewportController.onTransform`.
   */
  onCanvasResized: (() => void) | null = null

  /**
   * Pre-stroke pixels of the active layer, captured on pointerdown for
   * ERASER strokes only (they mutate the layer from the first stamp;
   * brush strokes live in the scratchpad until commit, so their undo
   * region is read at pointerup instead — no per-stroke-start readback).
   * Kept as a raw canvas, not a PNG: pointerup crops it to the stroke's
   * dirty rect before encoding, and stroke-cancel restores from it with
   * no decode round-trip.
   */
  pendingPreStrokeCanvas: { layerId: string; canvas: HTMLCanvasElement } | null = null

  /**
   * Pre-float full-layer readback for the in-flight selection move —
   * captured just before `selectionTool.beginMove` erases the source
   * region, cropped to the source∪dest union at commit for the undo
   * entry. Lives on the engine (not a component ref) because a move can
   * be driven by pointer drag (viewport) OR arrow-key nudge (editor),
   * and whichever surface commits needs the capture.
   */
  pendingSelectionCapture: { layerId: string; canvas: HTMLCanvasElement } | null = null

  /**
   * Serializes undo pushes across strokes: PNG encodes resolve on their
   * own schedule, and two quick strokes must land in the undo stack in
   * draw order or undo would restore the wrong states.
   */
  undoPushChain: Promise<void> = Promise.resolve()

  /**
   * Fired (once per engine) when `expandToFit` refuses to grow further
   * because the cap was hit. The editor wires this to a toast — the
   * engine stays framework-free.
   */
  onExpansionCapped: (() => void) | null = null
  private _expansionCapWarned = false

  /** Effective per-axis expansion cap; refined from GPU limits at init. */
  private _maxDimension = MAX_CANVAS_DIMENSION
  /**
   * Stable id for this canvas's pixel folder under
   * `_marrow/_drawings/<assetId>/`. `null` until the file has been loaded
   * from a v5 JSON that already has one, or until `writeCanvasFile`
   * mints one on first save. Rename of the `.canvas` file does not
   * touch this id — it travels with the JSON content, not the filename.
   */
  private _assetId: string | null = null

  /**
   * Observes the host container and resizes the PixiJS renderer to
   * match. Required because PixiJS v8's `resizeTo` option only reacts
   * to window resize events — when the *container* resizes (sidebar
   * collapsing, pane drag, devtools docking, etc.) the renderer is
   * left at its init-time dimensions and pointer coordinates fall out
   * of alignment with rendered pixels.
   */
  private resizeObserver: ResizeObserver | null = null

  /** Kept so we can unobserve during teardown. */
  private hostContainer: HTMLElement | null = null

  get initialized(): boolean {
    return this._initialized
  }

  get width(): number {
    return this._width
  }

  get height(): number {
    return this._height
  }

  get background(): string {
    return this._background
  }

  set background(color: string) {
    this._background = color
    this.onCanvasResized?.()
  }

  get assetId(): string | null {
    return this._assetId
  }

  /**
   * Set the canvas's stable asset id. Called from the load path when a
   * v5 JSON provides one, and from `writeCanvasFile` when a first-save
   * needs to mint one. Never rotate or clear this once it's set — every
   * reference on disk points at the resulting folder.
   */
  setAssetId(id: string): void {
    this._assetId = id
  }

  setDimensions(w: number, h: number): void {
    this._width = w
    this._height = h
    // If the engine is already initialized (e.g. called from readCanvasFile
    // after init), propagate so loadLayers uses the right RT size.
    if (this._initialized) {
      this.layerManager.setCanvasDimensions(w, h)
      this.onCanvasResized?.()
    }
  }

  /**
   * Expand the canvas to fit the given canvas-space point, if it lies
   * outside the current drawing bounds.
   *
   * Expansion is quantized to 1024-pixel steps so a single stroke near
   * the edge doesn't produce dozens of tiny grow operations, and clamped
   * to `min(MAX_CANVAS_DIMENSION, GPU max texture size)` — RenderTextures
   * beyond the GPU limit are silently blank on WebGL, which would eat
   * the user's layer pixels on the next expand-copy. Hitting the cap
   * fires `onExpansionCapped` once so the UI can explain why drawing
   * stops at the edge.
   *
   * Calling this repeatedly with the same out-of-bounds point is cheap —
   * the inner check in `LayerManager.expandCanvas` short-circuits when
   * the target dimensions haven't changed.
   *
   * Only positive expansion (right / down) is handled. Negative canvas
   * coordinates are not currently drawable — pan back to the canvas
   * origin to reach those areas.
   */
  expandToFit(x: number, y: number): void {
    if (!this._initialized) return
    if (x < this._width && y < this._height) return

    const STEP = 1024
    const max = this._maxDimension
    let newW = x >= this._width ? Math.ceil((x + 1) / STEP) * STEP : this._width
    let newH = y >= this._height ? Math.ceil((y + 1) / STEP) * STEP : this._height

    if (newW > max || newH > max) {
      newW = Math.min(newW, max)
      newH = Math.min(newH, max)
      if (!this._expansionCapWarned && (x >= max || y >= max)) {
        this._expansionCapWarned = true
        this.onExpansionCapped?.()
      }
    }
    if (newW === this._width && newH === this._height) return

    this.layerManager.expandCanvas(newW, newH)
    this._width = this.layerManager.canvasWidth
    this._height = this.layerManager.canvasHeight
    this.onCanvasResized?.()
  }

  /**
   * Abort the stroke currently being drawn (Escape). Brush strokes are
   * discarded from the scratchpad; eraser strokes have already mutated
   * the layer, so its pixels are restored from the pre-stroke readback
   * captured on pointerdown — no PNG decode involved.
   */
  cancelActiveStroke(): void {
    if (!this._initialized || !this.strokeEngine.isDrawing) return

    const pixelsMutated = this.strokeEngine.cancelStroke()
    const pre = this.pendingPreStrokeCanvas
    this.pendingPreStrokeCanvas = null

    if (pixelsMutated && pre) {
      this.layerManager.restoreLayerFromCanvas(pre.layerId, pre.canvas)
    }
    this.render()
  }

  /**
   * Initialize the PixiJS application and all subsystems.
   * Must be called once before any drawing operations.
   */
  async init(container: HTMLElement): Promise<void> {
    if (this._initialized) return

    this.app = new Application()
    await this.app.init({
      resizeTo: container,
      // Transparent renderer: the mat (area outside the canvas) and the
      // white "paper" are drawn as DOM elements BEHIND this canvas by
      // CanvasViewport. Keeping them out of the Pixi scene entirely is
      // deliberate — a full-canvas backdrop sprite in the viewport stalled
      // the GPU readback that region-scoped undo snapshots depend on
      // (canvas.toBlob went from ~0ms to ~1s). The DOM backdrop can't touch
      // the render pipeline, so extracts stay fast.
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      powerPreference: 'high-performance',
      // Do NOT auto-start the ticker here. The canvas file may still be
      // loading (async), and starting the ticker before layers are fully
      // set up creates a race: the RAF fires on a partially-constructed or
      // already-destroyed renderer (especially under React Strict Mode's
      // double-invocation), causing "Cannot read properties of null
      // (reading 'geometry')" in BatcherPipe.execute via GlBatchAdaptor.
      // The caller (canvas-editor.tsx) is responsible for calling
      // `engine.startTicker()` once the canvas is ready to paint.
      autoStart: false,
    })

    // Refine the expansion cap now that the GPU context exists.
    this._maxDimension = Math.min(MAX_CANVAS_DIMENSION, readGpuMaxTextureSize(this.app.renderer))

    // PixiJS v8 canvas element
    const canvas = this.app.canvas as HTMLCanvasElement
    canvas.style.touchAction = 'none'
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    // Force cursor inheritance from the viewport host `<div>`. `<canvas>`'s
    // UA-default `cursor: auto` resolves to `default` in Chromium (not to the
    // parent's used value), so the reactive `cursor` on the host div would
    // not actually paint — the canvas overlays it at 100% × 100% and shows
    // the UA default instead. `inherit` is explicit and makes CSS propagate
    // the host's resolved cursor through to the canvas surface. See BUG-06.
    canvas.style.cursor = 'inherit'
    container.appendChild(canvas)

    // Root viewport container (pan/zoom applies here). sortableChildren
    // lets the selection overlay stay above layers added later via its
    // zIndex instead of manual re-raising after every layer op.
    this.viewport = new Container()
    this.viewport.label = 'viewport'
    this.viewport.sortableChildren = true
    this.app.stage.addChild(this.viewport)

    // Subsystems
    this.layerManager = new LayerManager(this.app, this.viewport, this._width, this._height)
    this.brushSystem = new BrushSystem(this.app)
    this.strokeEngine = new StrokeEngine(this.layerManager, this.brushSystem)
    this.viewportController = new ViewportController(this.viewport)
    this.undoManager = new UndoManager(this.layerManager)
    this.selectionTool = new SelectionTool(this.app, this.layerManager, this.viewport)

    this._initialized = true

    // Watch the host container for size changes. `resizeTo` above only
    // listens to window resizes — it will not fire when the container
    // itself changes size independently (sidebar toggle, split-pane
    // drag, devtools dock, mobile orientation-triggered layout swap,
    // etc.) so pointer coordinates drift out of sync with rendered
    // pixels and strokes land at the wrong place.
    //
    // The observer is disconnected synchronously at the top of
    // destroy() so its callback cannot fire on a torn-down renderer.
    this.hostContainer = container
    this.resizeObserver = new ResizeObserver((entries) => {
      if (!this._initialized) return
      const entry = entries[0]
      if (!entry) return
      const w = Math.max(1, Math.floor(entry.contentRect.width))
      const h = Math.max(1, Math.floor(entry.contentRect.height))
      try {
        this.app.renderer.resize(w, h)
      } catch {
        // Renderer may be mid-teardown. Drop the resize — destroy() is
        // about to nuke everything anyway.
      }
    })
    this.resizeObserver.observe(container)
  }

  /**
   * Start the Pixi ticker so the canvas begins rendering frames.
   *
   * Called by the editor component *after* the canvas file has been
   * fully loaded (or `initDefault()` has been called for a new canvas).
   * Keeping the ticker off during async file I/O eliminates the race
   * where `renderer.render()` is called inside `loadLayers` concurrently
   * with a stale RAF from a previous (destroyed) application instance,
   * causing "Cannot read properties of null (reading 'geometry')".
   */
  startTicker(): void {
    if (!this._initialized) return
    try {
      this.app.ticker.start()
    } catch {
      /* ignore */
    }
  }

  /** Set up a default canvas with one blank layer. */
  initDefault(): void {
    this.layerManager.addLayer('Layer 1')
  }

  /** Render the scene (call after visual changes outside pointer events). */
  render(): void {
    if (!this._initialized) return
    try {
      this.app.render()
    } catch {
      // Renderer may be destroyed during teardown
    }
  }

  /** Clean up all GPU resources. */
  destroy(): void {
    if (!this._initialized) return

    // Flip the init flag first so any observer callback that has
    // already been queued for this microtask short-circuits.
    this._initialized = false

    // Disconnect observers SYNCHRONOUSLY before any other teardown.
    // If we disconnected after ticker.stop() / app.destroy(), a pending
    // ResizeObserver callback could still fire and call renderer.resize
    // on a destroyed renderer — the same class of bug CLAUDE.md's
    // "Canvas Lifecycle" section warns about for the Pixi ticker.
    if (this.resizeObserver) {
      try {
        if (this.hostContainer) this.resizeObserver.unobserve(this.hostContainer)
        this.resizeObserver.disconnect()
      } catch {
        /* ignore */
      }
      this.resizeObserver = null
    }
    this.hostContainer = null
    this.onCanvasResized = null

    try {
      this.app.ticker?.stop()
    } catch {
      /* ignore */
    }

    this.undoManager.clear()
    this.selectionTool.destroy()
    this.brushSystem.destroy()
    this.layerManager.destroy()

    try {
      this.app.destroy(true, { children: true })
    } catch {
      /* ignore */
    }
  }
}

/**
 * Read the GPU's per-axis texture-size limit from the active renderer.
 * WebGL exposes it via `gl.getParameter`; WebGPU via device limits.
 * Falls back to 4096 — the guaranteed WebGL2 minimum — when neither
 * shape is recognizable.
 */
function readGpuMaxTextureSize(renderer: unknown): number {
  const gl = (renderer as { gl?: WebGLRenderingContext }).gl
  if (gl && typeof gl.getParameter === 'function') {
    const v = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
    if (typeof v === 'number' && v > 0) return v
  }
  const gpuDevice = (
    renderer as { gpu?: { device?: { limits?: { maxTextureDimension2D?: number } } } }
  ).gpu?.device
  const dim = gpuDevice?.limits?.maxTextureDimension2D
  if (typeof dim === 'number' && dim > 0) return dim
  return 4096
}
