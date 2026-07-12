import { Container, Graphics, Sprite, Texture } from 'pixi.js'
import type { Application, RenderTexture } from 'pixi.js'
import type { LayerManager } from '@/lib/canvas/layer-manager'
import type { SnapshotRegion } from '@/types/canvas'

/** Normalized, integer, canvas-space selection rect. */
export type SelectionRect = SnapshotRegion

/**
 * Copy/paste clipboard for selection pixels. Module scope, not
 * per-tool: it survives engine teardown (tab switches destroy the
 * whole engine) and lets pixels travel between canvases. Holds a
 * plain HTMLCanvasElement — GPU textures are minted fresh per paste
 * because a texture would die with its renderer.
 */
let selectionClipboard: {
  canvas: HTMLCanvasElement
  /** Source rect the pixels came from — paste lands there by default. */
  rect: SelectionRect
} | null = null

export function hasSelectionClipboard(): boolean {
  return selectionClipboard !== null
}

/**
 * Where a paste would land on a canvas of the given size: the source
 * position, pulled inside the canvas if it would overhang (oversized
 * clipboards clip to the canvas). Null when the clipboard is empty.
 */
export function computePasteRect(canvasW: number, canvasH: number): SelectionRect | null {
  if (!selectionClipboard) return null
  const { rect } = selectionClipboard
  const width = Math.min(rect.width, canvasW)
  const height = Math.min(rect.height, canvasH)
  return {
    x: Math.max(0, Math.min(rect.x, canvasW - width)),
    y: Math.max(0, Math.min(rect.y, canvasH - height)),
    width,
    height,
  }
}

/**
 * Rectangular marquee selection + move for the active layer.
 *
 * Lifecycle is deliberately short-lived: a move FLOATS the selected
 * pixels at drag start (region extracted to a sprite, erased from the
 * layer) and COMMITS at pointerup (sprite rendered back at the new
 * position). Nothing stays floating between drags, so autosave, tab
 * switches, undo, and layer operations never see a half-moved layer.
 *
 * Undo integration happens in the caller (canvas-viewport): it captures
 * the full pre-float layer canvas before `beginMove` (same pattern as
 * the eraser's pre-stroke readback) and crops it to the union of the
 * source and destination rects at commit.
 *
 * The marquee visual is a Graphics rect in a `zIndex`-raised container
 * inside the viewport, so it pans/zooms with the canvas; line width is
 * divided by zoom to stay 1px on screen.
 */
export class SelectionTool {
  private app: Application
  private layerManager: LayerManager
  private overlay: Graphics
  private overlayContainer: Container

  private _rect: SelectionRect | null = null
  private marqueeStart: { x: number; y: number } | null = null

  /** Floating pixels mid-move-drag. */
  private floating: {
    sprite: Sprite
    texture: Texture
    sourceRect: SelectionRect
    grabDX: number
    grabDY: number
  } | null = null

  constructor(app: Application, layerManager: LayerManager, viewport: Container) {
    this.app = app
    this.layerManager = layerManager
    this.overlay = new Graphics()
    this.overlayContainer = new Container()
    this.overlayContainer.label = 'selection-overlay'
    this.overlayContainer.zIndex = 10_000
    this.overlayContainer.addChild(this.overlay)
    viewport.addChild(this.overlayContainer)
  }

  get rect(): SelectionRect | null {
    return this._rect
  }

  get isMoving(): boolean {
    return this.floating !== null
  }

  get isMarqueeing(): boolean {
    return this.marqueeStart !== null
  }

  contains(x: number, y: number): boolean {
    const r = this._rect
    if (!r) return false
    return x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height
  }

  /* ---- Marquee ---- */

  beginMarquee(x: number, y: number): void {
    this.marqueeStart = { x, y }
    this._rect = null
    this.redraw(1)
  }

  updateMarquee(x: number, y: number, zoom: number): void {
    const start = this.marqueeStart
    if (!start) return
    this._rect = normalizeRect(start.x, start.y, x, y)
    this.redraw(zoom)
  }

  /** Finalize the marquee; selections under 2×2 px clear instead. */
  endMarquee(canvasW: number, canvasH: number, zoom: number): void {
    this.marqueeStart = null
    if (this._rect) {
      this._rect = clampRect(this._rect, canvasW, canvasH)
      if (this._rect && (this._rect.width < 2 || this._rect.height < 2)) {
        this._rect = null
      }
    }
    this.redraw(zoom)
  }

  /* ---- Move ---- */

  /**
   * Float the selected pixels: copy the region into a sprite and erase
   * it from the active layer. Returns false when there is nothing to
   * float (no selection / no active layer / extract failure).
   */
  beginMove(grabX: number, grabY: number): boolean {
    const rect = this._rect
    const active = this.layerManager.getActiveLayer()
    if (!rect || !active || active.locked || this.floating) return false

    const canvas = this.layerManager.extractLayerCanvas(active.id, rect)
    if (!canvas) return false

    const texture = Texture.from(canvas)
    const sprite = new Sprite(texture)
    sprite.position.set(rect.x, rect.y)
    this.overlayContainer.addChild(sprite)
    // Keep the marquee outline above the floating pixels
    this.overlayContainer.setChildIndex(this.overlay, this.overlayContainer.children.length - 1)

    // Erase the source region from the layer
    this.layerManager.eraseLayerRegion(active.id, rect)

    this.floating = {
      sprite,
      texture,
      sourceRect: { ...rect },
      grabDX: grabX - rect.x,
      grabDY: grabY - rect.y,
    }
    return true
  }

  updateMove(x: number, y: number, zoom: number): void {
    const f = this.floating
    if (!f || !this._rect) return
    const nx = Math.round(x - f.grabDX)
    const ny = Math.round(y - f.grabDY)
    f.sprite.position.set(nx, ny)
    this._rect = { ...this._rect, x: nx, y: ny }
    this.redraw(zoom)
  }

  /** Shift the float by a relative delta (arrow-key nudging). */
  nudgeFloat(dx: number, dy: number, zoom: number): void {
    const f = this.floating
    if (!f || !this._rect) return
    const nx = this._rect.x + dx
    const ny = this._rect.y + dy
    f.sprite.position.set(nx, ny)
    this._rect = { ...this._rect, x: nx, y: ny }
    this.redraw(zoom)
  }

  /**
   * Commit the float: render the sprite into the active layer at its
   * current position. Returns the source and destination rects so the
   * caller can build the undo region (their union), or null if nothing
   * was floating.
   */
  commitMove(zoom: number): { sourceRect: SelectionRect; destRect: SelectionRect } | null {
    const f = this.floating
    const active = this.layerManager.getActiveLayer()
    if (!f) return null

    if (active) {
      this.stampTexture(f.texture, f.sprite.position.x, f.sprite.position.y, active.renderTexture)
      active.lastSavedBase64 = null
    }

    const destRect: SelectionRect = {
      x: f.sprite.position.x,
      y: f.sprite.position.y,
      width: f.sourceRect.width,
      height: f.sourceRect.height,
    }
    const sourceRect = f.sourceRect

    this.overlayContainer.removeChild(f.sprite)
    f.sprite.destroy()
    f.texture.destroy(true)
    this.floating = null
    this.redraw(zoom)

    return { sourceRect, destRect }
  }

  /** Abort a float mid-drag: put the pixels back where they came from. */
  cancelMove(zoom: number): void {
    const f = this.floating
    const active = this.layerManager.getActiveLayer()
    if (!f) return

    if (active) {
      this.stampTexture(f.texture, f.sourceRect.x, f.sourceRect.y, active.renderTexture)
      active.lastSavedBase64 = null
    }

    this.overlayContainer.removeChild(f.sprite)
    f.sprite.destroy()
    f.texture.destroy(true)
    this.floating = null
    this._rect = { ...f.sourceRect }
    this.redraw(zoom)
  }

  /* ---- Select all / delete / copy / paste ---- */

  /** Select the whole canvas (cancelling any in-flight move first). */
  selectAll(canvasW: number, canvasH: number, zoom: number): void {
    if (this.floating) this.cancelMove(zoom)
    this.marqueeStart = null
    this._rect = { x: 0, y: 0, width: canvasW, height: canvasH }
    this.redraw(zoom)
  }

  /**
   * Copy the selected pixels of the active layer to the module
   * clipboard. Non-destructive — no undo entry needed. Reads through
   * layer lock (copying is not a mutation).
   */
  copySelection(): boolean {
    const rect = this._rect
    const active = this.layerManager.getActiveLayer()
    if (!rect || !active || this.floating) return false
    const canvas = this.layerManager.extractLayerCanvas(active.id, rect)
    if (!canvas) return false
    selectionClipboard = { canvas, rect: { ...rect } }
    return true
  }

  /**
   * Erase the selected region from the active layer. Returns the rect
   * that was erased, or null when there is nothing to erase (no
   * selection / locked / mid-move). The caller owns the undo entry —
   * it must snapshot the rect BEFORE calling this.
   */
  eraseSelection(): SelectionRect | null {
    const rect = this._rect
    const active = this.layerManager.getActiveLayer()
    if (!rect || !active || active.locked || this.floating) return null
    this.layerManager.eraseLayerRegion(active.id, rect)
    return rect
  }

  /**
   * Stamp the clipboard pixels onto the active layer at `dest` (from
   * `computePasteRect`) and select them, so the paste can be moved
   * immediately. The caller owns the undo entry — it must snapshot
   * `dest` BEFORE calling this.
   */
  pasteAt(dest: SelectionRect, zoom: number): boolean {
    const active = this.layerManager.getActiveLayer()
    if (!selectionClipboard || !active || active.locked || this.floating) return false

    const texture = Texture.from(selectionClipboard.canvas)
    this.stampTexture(texture, dest.x, dest.y, active.renderTexture)
    texture.destroy(true) // Cache.set(resource) self-removes on destroy
    active.lastSavedBase64 = null

    this.marqueeStart = null
    this._rect = { ...dest }
    this.redraw(zoom)
    return true
  }

  /* ---- Shared ---- */

  /**
   * Render the floating texture into a layer RT via a fresh DETACHED
   * sprite. Never pass the scene-attached display sprite to a standalone
   * `renderer.render` — its scene-graph transform state lands the pixels
   * at the wrong coordinates.
   */
  private stampTexture(texture: Texture, x: number, y: number, target: RenderTexture): void {
    const container = new Container()
    const stamp = new Sprite(texture)
    stamp.position.set(x, y)
    container.addChild(stamp)
    this.app.renderer.render({ container, target, clear: false })
    container.destroy({ children: true }) // texture survives; caller owns it
  }

  clearSelection(zoom = 1): void {
    if (this.floating) this.cancelMove(zoom)
    this._rect = null
    this.marqueeStart = null
    this.redraw(zoom)
  }

  /** Redraw the marquee outline (double line for contrast; 1px at any zoom). */
  redraw(zoom: number): void {
    this.overlay.clear()
    const r = this._rect
    if (!r) return
    const w = 1 / Math.max(0.01, zoom)
    this.overlay
      .rect(r.x, r.y, r.width, r.height)
      .stroke({ width: w * 3, color: 0xffffff, alpha: 0.9 })
    this.overlay.rect(r.x, r.y, r.width, r.height).stroke({ width: w, color: 0x1c7ed6 })
  }

  destroy(): void {
    if (this.floating) {
      this.floating.sprite.destroy()
      this.floating.texture.destroy(true)
      this.floating = null
    }
    this.overlay.destroy()
    this.overlayContainer.destroy({ children: true })
  }
}

function normalizeRect(x0: number, y0: number, x1: number, y1: number): SelectionRect {
  const x = Math.floor(Math.min(x0, x1))
  const y = Math.floor(Math.min(y0, y1))
  return {
    x,
    y,
    width: Math.ceil(Math.abs(x1 - x0)),
    height: Math.ceil(Math.abs(y1 - y0)),
  }
}

function clampRect(r: SelectionRect, canvasW: number, canvasH: number): SelectionRect | null {
  const x = Math.max(0, r.x)
  const y = Math.max(0, r.y)
  const width = Math.min(r.x + r.width, canvasW) - x
  const height = Math.min(r.y + r.height, canvasH) - y
  if (width <= 0 || height <= 0) return null
  return { x, y, width, height }
}
