'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Maximize, ZoomIn, ZoomOut } from 'lucide-react'
import type { CanvasEngine } from '@/lib/canvas/engine'
import { useCanvasStore } from '@/stores/canvas'
import { hexToRgba, rgbToHex } from '@/lib/canvas/flood-fill'
import { encodeCanvasRegionSnapshot } from '@/lib/canvas/undo-manager'
import {
  captureSelectionMoveStart,
  commitSelectionMove,
  clampRegion,
} from '@/components/canvas/selection-ops'
import type { CanvasTool, BrushSettings, LayerSnapshot } from '@/types/canvas'

interface CanvasViewportProps {
  engineRef: React.RefObject<CanvasEngine | null>
  containerRef: React.RefObject<HTMLDivElement | null>
  /** True once the engine has initialized + loaded — gates backdrop wiring. */
  ready: boolean
}

/**
 * The div that hosts the PixiJS <canvas>.
 * Handles all pointer events (drawing, panning) and wheel (zoom).
 *
 * Pointer handlers read tool state via `useCanvasStore.getState()` to avoid
 * stale closures — a tool switch mid-stroke (unlikely but possible via
 * keyboard shortcut) should be picked up instantly without re-wiring
 * listeners. The cursor style, however, is a *render-time* concern and
 * MUST come from a reactive selector so the component re-renders when
 * the tool changes — otherwise the inline `style.cursor` is frozen at
 * first-mount value. See BUG-06.
 */
/** Live positions of the touch pointers involved in a pinch gesture. */
interface GestureState {
  lastDist: number
  lastMidX: number
  lastMidY: number
}

export function CanvasViewport({ engineRef, containerRef, ready }: CanvasViewportProps) {
  const activePointerRef = useRef<number | null>(null)

  /**
   * The white "paper" backdrop. Drawn as a DOM element behind the
   * transparent Pixi canvas (NOT in the Pixi scene — a full-canvas
   * backdrop sprite there stalled the GPU readback that undo snapshots
   * depend on). Positioned imperatively in lockstep with the Pixi
   * viewport transform via `viewportController.onTransform`, so it never
   * lags the layers and never triggers a React re-render on pan/zoom.
   */
  const paperRef = useRef<HTMLDivElement>(null)

  /**
   * True while the pointer is over the selection rect (select tool only)
   * — drives the 'move' cursor affordance. Updated from pointermove,
   * flipping state only on boundary crossings.
   */
  const [hoverInSelection, setHoverInSelection] = useState(false)

  /** All currently-down touch pointers (id → client coords). */
  const touchPointsRef = useRef(new Map<number, { x: number; y: number }>())
  /** Non-null while a two-finger pinch/pan gesture is in progress. */
  const gestureRef = useRef<GestureState | null>(null)
  /**
   * Set when a gesture starts; drawing stays suppressed until every
   * finger lifts, so the surviving finger of a pinch can't paint.
   */
  const suppressDrawingRef = useRef(false)

  // Reactive selectors — these drive the cursor style below.
  const activeTool = useCanvasStore((s) => s.activeTool)
  const activeLayerId = useCanvasStore((s) => s.activeLayerId)
  const layers = useCanvasStore((s) => s.layers)
  const brushSettings = useCanvasStore((s) => s.brushSettings)
  const eraserSize = useCanvasStore((s) => s.eraserSize)
  const zoom = useCanvasStore((s) => s.viewport.zoom)

  const activeLayerLocked = useMemo(
    () => layers.find((l) => l.id === activeLayerId)?.locked ?? false,
    [layers, activeLayerId],
  )

  // CSS cursors cap at 128px in most browsers; past that we hide the
  // circle from the cursor itself and track the pointer with an HTML
  // ring overlay instead, which can be any size.
  const overlayDia = useMemo(() => {
    if (activeTool !== 'brush' && activeTool !== 'eraser') return 0
    if (activeLayerLocked) return 0
    const size = activeTool === 'eraser' ? eraserSize : brushSettings.size
    const dia = Math.round(size * zoom)
    return dia > MAX_CURSOR_PX ? dia : 0
  }, [activeTool, activeLayerLocked, brushSettings.size, eraserSize, zoom])

  const cursorOverlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = containerRef.current
    const ring = cursorOverlayRef.current
    if (!host || !ring || overlayDia === 0) return

    const move = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect()
      ring.style.display = 'block'
      ring.style.transform = `translate(${e.clientX - rect.left - overlayDia / 2}px, ${
        e.clientY - rect.top - overlayDia / 2
      }px)`
    }
    const hide = () => {
      ring.style.display = 'none'
    }
    host.addEventListener('pointermove', move)
    host.addEventListener('pointerleave', hide)
    return () => {
      host.removeEventListener('pointermove', move)
      host.removeEventListener('pointerleave', hide)
      hide()
    }
  }, [containerRef, overlayDia])

  const cursor = useMemo(() => {
    if (overlayDia > 0) return 'crosshair'
    if (activeTool === 'select' && hoverInSelection) return 'move'
    return cursorForTool(activeTool, activeLayerLocked, brushSettings, eraserSize, zoom)
  }, [overlayDia, activeTool, hoverInSelection, activeLayerLocked, brushSettings, eraserSize, zoom])

  // The marquee outline is stroked at 1px-on-screen; re-stroke it when
  // the zoom changes (wheel, pinch, or zoom buttons).
  useEffect(() => {
    const engine = engineRef.current
    if (!engine?.initialized) return
    engine.selectionTool.redraw(zoom)
    engine.render()
  }, [zoom, engineRef])

  // Position the DOM "paper" backdrop to match the canvas bounds under the
  // live viewport transform. Wired once the engine is ready to two engine
  // hooks: `onTransform` (pan/zoom, fires synchronously with the Pixi
  // transform) and `onCanvasResized` (load / auto-expansion). Reads dims +
  // state straight off the engine each call, so both hooks can share it.
  useEffect(() => {
    const engine = engineRef.current
    if (!ready || !engine?.initialized) return

    const paint = () => {
      const paper = paperRef.current
      if (!paper) return
      const { x, y, zoom: z } = engine.viewportController.state
      paper.style.width = `${engine.width}px`
      paper.style.height = `${engine.height}px`
      paper.style.transform = `translate(${x}px, ${y}px) scale(${z})`
      paper.style.background = engine.background
    }

    paint()
    engine.viewportController.onTransform = paint
    engine.onCanvasResized = paint
    return () => {
      if (engine.viewportController) engine.viewportController.onTransform = null
      engine.onCanvasResized = null
    }
  }, [ready, engineRef])

  // The selection PERSISTS across tool switches — it constrains brush,
  // eraser, and fill (Photoshop-style). Switching away from Select only
  // settles transient state: a pending float commits (so no half-moved
  // layer outlives the tool) and an in-progress marquee finalizes.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine?.initialized || activeTool === 'select') return
    setHoverInSelection(false)
    if (engine.selectionTool.isMoving) commitSelectionMove(engine)
    if (engine.selectionTool.isMarqueeing) {
      engine.selectionTool.endMarquee(
        engine.width,
        engine.height,
        engine.viewportController.state.zoom,
      )
    }
    engine.render()
  }, [activeTool, engineRef])

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const engine = engineRef.current
      if (!engine?.initialized) return

      const el = e.currentTarget
      el.setPointerCapture(e.pointerId)

      // ---- Two-finger pinch-zoom / pan (touch only) ----
      if (e.pointerType === 'touch') {
        touchPointsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

        if (touchPointsRef.current.size === 2) {
          // Second finger landed: this is a gesture, not a stroke. Abort
          // anything the first finger started and suppress drawing until
          // all fingers lift.
          suppressDrawingRef.current = true
          if (engine.strokeEngine.isDrawing) engine.cancelActiveStroke()
          // Abort selection gestures: a mid-drag move returns its pixels
          // to the source (keeping the selection); a mid-drag marquee is
          // dropped (it was never finalized).
          if (engine.selectionTool.isMoving) {
            engine.pendingSelectionCapture = null
            engine.selectionTool.cancelMove(engine.viewportController.state.zoom)
            engine.render()
          } else if (engine.selectionTool.isMarqueeing) {
            engine.selectionTool.clearSelection(engine.viewportController.state.zoom)
            engine.render()
          }
          if (engine.viewportController.isPanning) engine.viewportController.endPan()

          const [a, b] = [...touchPointsRef.current.values()]
          gestureRef.current = {
            lastDist: Math.hypot(b.x - a.x, b.y - a.y),
            lastMidX: (a.x + b.x) / 2,
            lastMidY: (a.y + b.y) / 2,
          }
          return
        }
        if (suppressDrawingRef.current) return
      }

      activePointerRef.current = e.pointerId

      const tool = useCanvasStore.getState().activeTool
      const rect = el.getBoundingClientRect()

      if (tool === 'pan' || e.button === 1 || (e.altKey && tool !== 'eyedropper')) {
        // Pan with middle click, alt+click, or pan tool
        engine.viewportController.beginPan(e.clientX, e.clientY)
        return
      }

      if (tool === 'select') {
        const canvasPoint = engine.viewportController.screenToCanvas(e.clientX, e.clientY, rect)
        const sel = engine.selectionTool
        // An arrow-key nudge may have left a float pending its debounced
        // commit — land it before this pointer interaction takes over.
        if (sel.isMoving) commitSelectionMove(engine)
        // Click inside the existing selection drags it; anywhere else
        // starts a fresh marquee (dropping the old selection).
        if (sel.rect && sel.contains(canvasPoint.x, canvasPoint.y)) {
          // Read the full layer back BEFORE beginMove erases the source
          // region — this canvas backs the undo entry at commit.
          if (captureSelectionMoveStart(engine) && sel.beginMove(canvasPoint.x, canvasPoint.y)) {
            engine.render()
            return
          }
          engine.pendingSelectionCapture = null
        }
        sel.beginMarquee(canvasPoint.x, canvasPoint.y)
        engine.render()
        return
      }

      if (tool === 'brush' || tool === 'eraser') {
        const canvasPoint = engine.viewportController.screenToCanvas(e.clientX, e.clientY, rect)
        const state = useCanvasStore.getState()
        const settings =
          tool === 'eraser'
            ? { ...state.brushSettings, size: state.eraserSize }
            : state.brushSettings

        // Auto-expand the canvas if this stroke starts beyond the current bounds.
        engine.expandToFit(canvasPoint.x, canvasPoint.y)

        // An active selection constrains painting: brush strokes clip at
        // the scratchpad (preview + commit), eraser stamp batches clip at
        // render time. Set (or clear) both per stroke so neither goes
        // stale when the selection changes between strokes.
        const clip = engine.selectionTool.rect
        engine.layerManager.setStrokeClip(tool === 'brush' ? clip : null)
        engine.brushSystem.setClipRect(tool === 'eraser' ? clip : null)

        // Eraser strokes mutate the layer from the very first stamp, so
        // read the pre-stroke pixels back NOW (synchronously). The raw
        // canvas is cropped to the stroke's dirty rect at pointerup for
        // the undo entry, and used as-is by stroke-cancel. Brush strokes
        // need nothing here — the layer is untouched until commit, so
        // their undo region is captured at pointerup instead.
        if (tool === 'eraser') {
          const layerId = engine.layerManager.activeLayerId
          const canvas = layerId ? engine.layerManager.extractLayerCanvas(layerId) : null
          engine.pendingPreStrokeCanvas = layerId && canvas ? { layerId, canvas } : null
        }

        engine.strokeEngine.beginStroke(
          {
            x: canvasPoint.x,
            y: canvasPoint.y,
            // Mouse is a binary device — spec reports 0.5 when pressed, but
            // that halves the brush size vs the configured value. Treat mouse
            // as full pressure so size-setting = actual painted size. Stylus
            // and touch keep their real reported pressure for expression.
            pressure: e.pointerType === 'mouse' ? 1.0 : e.pressure || 0.5,
            tiltX: e.tiltX,
            tiltY: e.tiltY,
            timestamp: e.timeStamp,
          },
          settings,
          tool === 'eraser',
          // Shift+click rules a straight line from the last stroke's end
          e.shiftKey,
        )
        engine.render()
      }

      if (tool === 'fill') {
        const canvasPoint = engine.viewportController.screenToCanvas(e.clientX, e.clientY, rect)
        const state = useCanvasStore.getState()
        const [r, g, b, a] = hexToRgba(state.brushSettings.color, state.brushSettings.opacity)
        const layerId = engine.layerManager.activeLayerId
        if (!layerId) return

        // An active selection bounds the fill (and lets the undo entry
        // be region-scoped). A selection pushed fully off-canvas clamps
        // to nothing — the fill is refused rather than run unbounded.
        const sel = engine.selectionTool.rect
        const fillBounds = sel ? clampRegion(sel, engine.width, engine.height) : null
        if (sel && !fillBounds) return

        // Snapshot + fill + push undo, sequenced. The snapshot must
        // complete *before* the fill mutates the RT, otherwise we'd
        // capture the post-fill state and undo would be a no-op.
        void (async () => {
          try {
            const snapshot = fillBounds
              ? await engine.undoManager.snapshotActiveLayerRegion(fillBounds)
              : await engine.undoManager.snapshotActiveLayer()
            const ok = await engine.layerManager.floodFillLayer(
              layerId,
              canvasPoint.x,
              canvasPoint.y,
              r,
              g,
              b,
              a,
              fillBounds ?? undefined,
            )
            if (!ok) return
            engine.render()
            if (snapshot) {
              engine.undoManager.push({
                kind: 'stroke',
                description: 'Fill',
                snapshots: [snapshot],
              })
            }
            const store = useCanvasStore.getState()
            store.markDirty()
            store.setUndoState(engine.undoManager.canUndo, engine.undoManager.canRedo)
          } catch (err) {
            console.error('Fill failed:', err)
          }
        })()
        return
      }

      if (tool === 'eyedropper') {
        // Sample the composited pixel under the cursor, convert to
        // #rrggbb, push into brush settings + recent-colours list.
        // No undo entry — the eyedropper is non-destructive.
        const canvasPoint = engine.viewportController.screenToCanvas(e.clientX, e.clientY, rect)
        const sample = engine.layerManager.sampleCompositedPixel(
          canvasPoint.x,
          canvasPoint.y,
          engine.background,
        )
        if (sample) {
          const hex = rgbToHex(sample.r, sample.g, sample.b)
          const store = useCanvasStore.getState()
          store.setBrushSettings({ color: hex })
          store.pushRecentColor(hex)
        }
        return
      }
    },
    [engineRef],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const engine = engineRef.current
      if (!engine?.initialized) return

      // 'move' cursor affordance while hovering the selection rect.
      // isMoving keeps it during a drag; a marquee-in-progress never
      // shows it (the pointer is inside the growing rect by definition).
      if (e.pointerType === 'mouse' && useCanvasStore.getState().activeTool === 'select') {
        const sel = engine.selectionTool
        const rect = e.currentTarget.getBoundingClientRect()
        const pt = engine.viewportController.screenToCanvas(e.clientX, e.clientY, rect)
        const inside = sel.isMoving || (!sel.isMarqueeing && sel.contains(pt.x, pt.y))
        setHoverInSelection((prev) => (prev === inside ? prev : inside))
      }

      // ---- Pinch gesture: zoom at midpoint + two-finger pan ----
      if (e.pointerType === 'touch' && touchPointsRef.current.has(e.pointerId)) {
        touchPointsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

        const gesture = gestureRef.current
        if (gesture && touchPointsRef.current.size >= 2) {
          const [a, b] = [...touchPointsRef.current.values()]
          const dist = Math.hypot(b.x - a.x, b.y - a.y)
          const midX = (a.x + b.x) / 2
          const midY = (a.y + b.y) / 2
          const rect = e.currentTarget.getBoundingClientRect()

          if (gesture.lastDist > 0 && dist > 0) {
            engine.viewportController.zoomByFactorAtPoint(
              dist / gesture.lastDist,
              midX - rect.left,
              midY - rect.top,
            )
          }
          engine.viewportController.panBy(midX - gesture.lastMidX, midY - gesture.lastMidY)

          gesture.lastDist = dist
          gesture.lastMidX = midX
          gesture.lastMidY = midY

          useCanvasStore.getState().setViewport(engine.viewportController.state)
          engine.render()
          return
        }
        if (suppressDrawingRef.current) return
      }

      if (activePointerRef.current !== e.pointerId) return

      if (engine.viewportController.isPanning) {
        engine.viewportController.updatePan(e.clientX, e.clientY)
        useCanvasStore.getState().setViewport(engine.viewportController.state)
        engine.render()
        return
      }

      const sel = engine.selectionTool
      if (sel.isMarqueeing || sel.isMoving) {
        const rect = e.currentTarget.getBoundingClientRect()
        const canvasPoint = engine.viewportController.screenToCanvas(e.clientX, e.clientY, rect)
        const zoom = engine.viewportController.state.zoom
        if (sel.isMoving) {
          sel.updateMove(canvasPoint.x, canvasPoint.y, zoom)
        } else {
          sel.updateMarquee(canvasPoint.x, canvasPoint.y, zoom)
        }
        engine.render()
        return
      }

      if (engine.strokeEngine.isDrawing) {
        const rect = e.currentTarget.getBoundingClientRect()
        const state = useCanvasStore.getState()
        const tool = state.activeTool
        const settings =
          tool === 'eraser'
            ? { ...state.brushSettings, size: state.eraserSize }
            : state.brushSettings

        // High-Hz styluses (and 120 Hz screens) deliver multiple samples
        // per animation frame; the React event only carries the last
        // one. Feed every coalesced sample into the stroke so fast
        // handwriting keeps its curvature instead of being straightened
        // by the frame rate.
        const native = e.nativeEvent
        const samples: PointerEvent[] =
          typeof native.getCoalescedEvents === 'function' && native.getCoalescedEvents().length > 0
            ? native.getCoalescedEvents()
            : [native]

        for (const sample of samples) {
          const canvasPoint = engine.viewportController.screenToCanvas(
            sample.clientX,
            sample.clientY,
            rect,
          )

          // Auto-expand mid-stroke if the pointer crosses the canvas boundary.
          // expandCanvas preserves scratchpad content so the stroke is seamless.
          engine.expandToFit(canvasPoint.x, canvasPoint.y)

          engine.strokeEngine.continueStroke(
            {
              x: canvasPoint.x,
              y: canvasPoint.y,
              pressure: sample.pointerType === 'mouse' ? 1.0 : sample.pressure || 0.5,
              tiltX: sample.tiltX,
              tiltY: sample.tiltY,
              timestamp: sample.timeStamp,
            },
            settings,
          )
        }
        engine.render()
      }
    },
    [engineRef],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const engine = engineRef.current
      if (!engine?.initialized) return

      const el = e.currentTarget
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {
        /* pointer may already be released */
      }

      // ---- Gesture bookkeeping ----
      if (e.pointerType === 'touch') {
        touchPointsRef.current.delete(e.pointerId)
        if (touchPointsRef.current.size < 2) gestureRef.current = null
        if (touchPointsRef.current.size === 0) suppressDrawingRef.current = false
        if (suppressDrawingRef.current) return
      }

      if (activePointerRef.current !== e.pointerId) return
      activePointerRef.current = null

      if (engine.viewportController.isPanning) {
        engine.viewportController.endPan()
        useCanvasStore.getState().setViewport(engine.viewportController.state)
        return
      }

      const sel = engine.selectionTool
      if (sel.isMarqueeing) {
        sel.endMarquee(engine.width, engine.height, engine.viewportController.state.zoom)
        engine.render()
        return
      }

      if (sel.isMoving) {
        // Undo covers everything the move touched: the hole left at the
        // source plus the pixels stamped at the destination.
        commitSelectionMove(engine)
        return
      }

      if (engine.strokeEngine.isDrawing) {
        const wasEraser = engine.strokeEngine.isEraserStroke
        const bounds = engine.strokeEngine.getStrokeBounds()

        // Dirty-region undo capture. Brush: the layer is still pristine
        // here (the stroke lives in the scratchpad until endStroke), so
        // read back just the stroke's rect NOW — the readback inside
        // snapshotActiveLayerRegion is synchronous. Eraser: the layer
        // was mutated live; crop the pointerdown full-layer readback to
        // the same rect and encode only that.
        let pending: Promise<LayerSnapshot | null> | null = null
        const region = bounds ? clampRegion(bounds, engine.width, engine.height) : null
        if (!wasEraser && region) {
          pending = engine.undoManager.snapshotActiveLayerRegion(region)
        }

        engine.strokeEngine.endStroke()
        engine.render()

        if (wasEraser) {
          const pre = engine.pendingPreStrokeCanvas
          engine.pendingPreStrokeCanvas = null
          if (pre && region) {
            pending = encodeCanvasRegionSnapshot(pre.layerId, pre.canvas, region)
          }
        }

        // Push the undo entry once the PNG encode resolves. Pushes are
        // chained so two quick strokes land in the stack in draw order
        // even if their encodes finish out of order.
        if (pending) {
          const snapshotPromise = pending
          engine.undoPushChain = engine.undoPushChain.then(async () => {
            const snapshot = await snapshotPromise
            if (snapshot) {
              engine.undoManager.push({
                kind: 'stroke',
                snapshots: [snapshot],
                description: 'Stroke',
              })
            }
            const store = useCanvasStore.getState()
            store.setUndoState(engine.undoManager.canUndo, engine.undoManager.canRedo)
          })
        }

        useCanvasStore.getState().markDirty()
      }
    },
    [engineRef],
  )

  /**
   * Attach `wheel` as a native, *non-passive* listener.
   *
   * React's synthetic `onWheel` is delegated through the root and we
   * cannot control its `passive` flag from JSX. In passive mode
   * `e.preventDefault()` is a silent no-op: the canvas still zooms, but
   * the outer scroll container *also* scrolls, producing a disorienting
   * "zoom + scroll-away" double-action and the browser logs
   * "Unable to preventDefault inside passive event listener".
   *
   * Attaching directly via `addEventListener(..., { passive: false })`
   * guarantees `preventDefault()` actually suppresses the native scroll,
   * regardless of what React's wheel delegation is doing today.
   *
   * The handler reads `engineRef.current` inside, so it does not need to
   * be re-bound on every engine swap.
   */
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      const engine = engineRef.current
      if (!engine?.initialized) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const pivotX = e.clientX - rect.left
      const pivotY = e.clientY - rect.top
      engine.viewportController.zoomAtPoint(-e.deltaY, pivotX, pivotY)
      useCanvasStore.getState().setViewport(engine.viewportController.state)
      engine.render()
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => {
      el.removeEventListener('wheel', handler)
    }
  }, [containerRef, engineRef])

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
  }, [])

  return (
    // Wrapper owns the overlay; the inner div is the Pixi host. They must
    // stay separate elements — Pixi appends its <canvas> imperatively into
    // the host, and React children mixed into the same node risk
    // removeChild crashes on unmount.
    // The wrapper background is the MAT (area outside the canvas). The Pixi
    // renderer is transparent, so this + the paper below show through. The
    // paper is a sibling BEHIND the Pixi host — never a child of it (Pixi
    // appends its <canvas> into the host and mixing React children there
    // risks removeChild crashes on unmount).
    <div className="relative min-h-0 flex-1 overflow-hidden bg-[#c6cacf] dark:bg-[#161719]">
      <div
        ref={paperRef}
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 origin-top-left shadow-sm"
        style={{ width: 0, height: 0, background: '#ffffff' }}
      />
      <div
        ref={containerRef}
        className="absolute inset-0"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={onContextMenu}
        style={{ touchAction: 'none', cursor }}
      />
      {overlayDia > 0 && (
        <div
          ref={cursorOverlayRef}
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 z-10 hidden rounded-full"
          style={{
            width: overlayDia,
            height: overlayDia,
            border: '1.5px solid rgba(0,0,0,0.55)',
            outline: '1.5px solid rgba(255,255,255,0.9)',
          }}
        />
      )}
      <ZoomControls engineRef={engineRef} containerRef={containerRef} zoom={zoom} />
    </div>
  )
}

/**
 * Floating zoom cluster (bottom-right): out / percentage / in / fit.
 * Clicking the percentage resets to 100%. A sibling of the Pixi host,
 * so its clicks never reach the drawing pointer handlers.
 */
function ZoomControls({
  engineRef,
  containerRef,
  zoom,
}: {
  engineRef: React.RefObject<CanvasEngine | null>
  containerRef: React.RefObject<HTMLDivElement | null>
  zoom: number
}) {
  function apply(fn: (engine: CanvasEngine, viewW: number, viewH: number) => void) {
    const engine = engineRef.current
    const el = containerRef.current
    if (!engine?.initialized || !el) return
    const rect = el.getBoundingClientRect()
    fn(engine, rect.width, rect.height)
    useCanvasStore.getState().setViewport(engine.viewportController.state)
    engine.render()
  }

  const btnCls =
    'text-fg-secondary hover:bg-bg-hover hover:text-fg flex size-7 items-center justify-center rounded-md transition-colors'

  return (
    <div className="border-border bg-bg absolute right-3 bottom-3 z-10 flex items-center gap-0.5 rounded-lg border p-1 shadow-md">
      <button
        type="button"
        title="Zoom out"
        aria-label="Zoom out"
        className={btnCls}
        onClick={() =>
          apply((engine, w, h) =>
            engine.viewportController.setZoom(engine.viewportController.state.zoom / 1.25, w, h),
          )
        }
      >
        <ZoomOut className="size-3.5" aria-hidden />
      </button>
      <button
        type="button"
        title="Reset to 100%"
        aria-label="Reset zoom to 100%"
        className="text-fg-secondary hover:bg-bg-hover hover:text-fg min-w-12 rounded-md px-1 py-1 text-center text-xs tabular-nums transition-colors"
        onClick={() => apply((engine, w, h) => engine.viewportController.setZoom(1, w, h))}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        title="Zoom in"
        aria-label="Zoom in"
        className={btnCls}
        onClick={() =>
          apply((engine, w, h) =>
            engine.viewportController.setZoom(engine.viewportController.state.zoom * 1.25, w, h),
          )
        }
      >
        <ZoomIn className="size-3.5" aria-hidden />
      </button>
      <button
        type="button"
        title="Fit canvas"
        aria-label="Fit canvas to view"
        className={btnCls}
        onClick={() =>
          apply((engine, w, h) =>
            engine.viewportController.fitToView(engine.width, engine.height, w, h),
          )
        }
      >
        <Maximize className="size-3.5" aria-hidden />
      </button>
    </div>
  )
}

/**
 * Encode an SVG string as a CSS cursor url(...) value.
 * The double-stroke technique (white thick + black thin) keeps the icon
 * legible on both light and dark canvas backgrounds.
 */
function svgCursor(svg: string, hotspotX: number, hotspotY: number, fallback: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hotspotX} ${hotspotY}, ${fallback}`
}

// Lucide PaintBucket paths — hotspot at the paint-drop centre (20, 19)
const FILL_CURSOR = svgCursor(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">` +
    `<g stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none">` +
    `<path d="m19 11-8-8-8.5 8.5a5.5 5.5 0 0 0 11 0Z"/>` +
    `<path d="m20 12 2-2"/><line x1="19" x2="21" y1="11" y2="9"/>` +
    `<path d="M22 17v1a2 2 0 0 1-4 0v-1a2 2 0 0 1 4 0Z"/>` +
    `</g>` +
    `<g stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none">` +
    `<path d="m19 11-8-8-8.5 8.5a5.5 5.5 0 0 0 11 0Z"/>` +
    `<path d="m20 12 2-2"/><line x1="19" x2="21" y1="11" y2="9"/>` +
    `<path d="M22 17v1a2 2 0 0 1-4 0v-1a2 2 0 0 1 4 0Z"/>` +
    `</g></svg>`,
  20,
  19,
  'cell',
)

// Lucide Pipette paths — hotspot at the pipette tip (2, 22)
const EYEDROPPER_CURSOR = svgCursor(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">` +
    `<g stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none">` +
    `<path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/>` +
    `<path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/>` +
    `</g>` +
    `<g stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none">` +
    `<path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/>` +
    `<path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/>` +
    `</g></svg>`,
  2,
  22,
  'crosshair',
)

// Brush/eraser cursor size bounds (CSS cursor max is 128 × 128 in most browsers)
const MIN_CURSOR_PX = 4
const MAX_CURSOR_PX = 128

/**
 * Build a dynamic brush cursor SVG.
 *
 * The circle is filled with the brush color at the current opacity. Hardness
 * drives a radial gradient: hardness=1 → solid fill, hardness=0 → full
 * centre-to-edge fade. A white outer ring + semi-transparent dark inner ring
 * keeps the cursor legible on both light and dark canvas backgrounds.
 *
 * Screen diameter = brushSize × zoom, clamped to 4–128 px.
 * Hotspot is at the circle centre so clicks land in the middle of the dot.
 */
function buildBrushCursor(settings: BrushSettings, zoom: number): string {
  const screenDia = Math.round(settings.size * zoom)
  const d = Math.max(MIN_CURSOR_PX, Math.min(MAX_CURSOR_PX, screenDia))
  const cx = d / 2
  const r = Math.max(0.5, cx - 1.5) // inner radius, leaving room for the ring stroke
  const hardnessPct = Math.round(settings.hardness * 100)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}" viewBox="0 0 ${d} ${d}">` +
    `<defs>` +
    `<radialGradient id="bg" cx="${cx}" cy="${cx}" r="${r}" gradientUnits="userSpaceOnUse">` +
    `<stop offset="${hardnessPct}%" stop-color="${settings.color}" stop-opacity="${settings.opacity}"/>` +
    `<stop offset="100%" stop-color="${settings.color}" stop-opacity="0"/>` +
    `</radialGradient>` +
    `</defs>` +
    `<circle cx="${cx}" cy="${cx}" r="${r}" stroke="white" stroke-width="2" fill="url(#bg)"/>` +
    `<circle cx="${cx}" cy="${cx}" r="${r}" stroke="rgba(0,0,0,0.55)" stroke-width="1" fill="none"/>` +
    `</svg>`
  const hotspot = Math.round(cx)
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hotspot} ${hotspot}, crosshair`
}

/**
 * Build a dynamic eraser cursor SVG.
 *
 * Shows an empty ring (no fill) so the user can see through it to the pixels
 * they are about to erase. Same double-ring contrast technique as the brush.
 *
 * Screen diameter = eraserSize × zoom, clamped to 4–128 px.
 */
function buildEraserCursor(eraserSize: number, zoom: number): string {
  const screenDia = Math.round(eraserSize * zoom)
  const d = Math.max(MIN_CURSOR_PX, Math.min(MAX_CURSOR_PX, screenDia))
  const cx = d / 2
  const r = Math.max(0.5, cx - 1)
  // White fill previews the erase-to-white effect; dark border keeps it
  // legible on both light and dark canvas backgrounds.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}" viewBox="0 0 ${d} ${d}">` +
    `<circle cx="${cx}" cy="${cx}" r="${r}" fill="white" stroke="rgba(0,0,0,0.5)" stroke-width="1.5"/>` +
    `</svg>`
  const hotspot = Math.round(cx)
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hotspot} ${hotspot}, crosshair`
}

/**
 * Resolve the CSS cursor for a given tool + active-layer-lock state.
 *
 * Locked active layer short-circuits to `not-allowed` for any tool that
 * would mutate pixels (brush, eraser, fill — eyedropper is read-only,
 * pan doesn't mutate). We deliberately still allow `grab` for pan even
 * when the layer is locked — panning the viewport is never a mutation.
 */
function cursorForTool(
  tool: CanvasTool,
  locked: boolean,
  brushSettings: BrushSettings,
  eraserSize: number,
  zoom: number,
): string {
  if (tool === 'pan') return 'grab'
  // Marquee selection on a locked layer is fine (non-mutating); only the
  // move itself is blocked, inside SelectionTool.beginMove.
  if (tool === 'select') return 'crosshair'
  if (locked) return 'not-allowed'
  switch (tool) {
    case 'brush':
      return buildBrushCursor(brushSettings, zoom)
    case 'eraser':
      return buildEraserCursor(eraserSize, zoom)
    case 'eyedropper':
      return EYEDROPPER_CURSOR
    case 'fill':
      return FILL_CURSOR
    default:
      return 'crosshair'
  }
}
