'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActiveSelection,
  Canvas as FabricCanvas,
  PencilBrush,
  Textbox as FabricTextbox,
  Rect as FabricRect,
  FabricImage,
  Path as FabricPath,
  Line as FabricLine,
  Triangle as FabricTriangle,
  Shadow as FabricShadow,
  type TPointerEventInfo,
  type FabricObject,
  Point as FabricPoint,
  util as fabricUtil,
} from 'fabric'
import { useCanvasStore } from '@/stores/canvas'
import { toast } from '@/stores/toast'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { resolveWikiLinkPath } from '@/lib/markdown'
import { collectMarkdownPaths } from '@/lib/notes/collect-markdown-paths'
import { deserializeCanvas, serializeCanvas, generateNodeId } from '@/lib/canvas'
import { CanvasUndoStack } from '@/lib/canvas/undo-stack'
import type {
  CanvasFile,
  CanvasTextNode,
  CanvasImageNode,
  CanvasStickyNode,
  CanvasDrawingNode,
  CanvasPath,
  CanvasEdge,
  CanvasFrame,
} from '@/types/canvas'
import { CanvasToolbar, type CanvasTextBarState } from './canvas-toolbar'

/** Deep-clone a CanvasFile so Immer freezing the store copy doesn't affect the mutable ref. */
function cloneFile(f: CanvasFile): CanvasFile {
  return JSON.parse(JSON.stringify(f))
}

const MIN_ZOOM = 0.1
const MAX_ZOOM = 5
const AUTOSAVE_INTERVAL = 3_000

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

type CanvasToolId = 'select' | 'draw' | 'text' | 'sticky' | 'connect' | 'erase'

/** Keep Fabric interaction mode aligned with the toolbar (and re-apply after async file load). */
function applyFabricToolMode(
  fc: FabricCanvas,
  activeTool: CanvasToolId,
  strokeColor: string,
  strokeWidth: number,
  strokeOpacity: number,
) {
  if (activeTool === 'draw') {
    fc.isDrawingMode = true
    const brush = new PencilBrush(fc)
    brush.color = strokeOpacity < 1 ? hexToRgba(strokeColor, strokeOpacity) : strokeColor
    brush.width = strokeWidth
    brush.decimate = 2
    fc.freeDrawingBrush = brush
  } else {
    fc.isDrawingMode = false
  }

  const canSelect = activeTool === 'select' || activeTool === 'connect'
  const lockMove = activeTool === 'connect'
  const isErase = activeTool === 'erase'
  fc.forEachObject((obj) => {
    obj.selectable = canSelect
    obj.evented = activeTool !== 'draw'
    obj.lockMovementX = lockMove
    obj.lockMovementY = lockMove
    obj.lockRotation = lockMove
    obj.lockScalingX = lockMove
    obj.lockScalingY = lockMove
    obj.hasControls = !lockMove
    const isThin = obj instanceof FabricLine || obj instanceof FabricTriangle || obj instanceof FabricPath
    obj.padding = isErase && isThin ? 8 : 0
    if (isErase) obj.hoverCursor = 'crosshair'
    else obj.hoverCursor = undefined as unknown as string
  })
  fc.selection = activeTool === 'select'

  const cursorMap: Partial<Record<CanvasToolId, string>> = {
    erase: 'crosshair',
    connect: 'crosshair',
    text: 'text',
    sticky: 'cell',
  }
  fc.defaultCursor = cursorMap[activeTool] ?? 'default'
  fc.hoverCursor = isErase ? 'crosshair' : 'move'
  fc.renderAll()
}

function applyFabricToolModeFromStore(fc: FabricCanvas) {
  const s = useCanvasStore.getState()
  applyFabricToolMode(fc, s.activeTool, s.strokeColor, s.strokeWidth, s.strokeOpacity)
}

/**
 * Textboxes that may use the formatting strip: plain text + sticky note body (`*_text`).
 * Excluded: wiki-link labels (`*_wl`), any object tagged with `__frameId` (frame titles).
 */
function isFormattableTextbox(obj: FabricObject | undefined): obj is FabricTextbox {
  if (!obj || !(obj instanceof FabricTextbox)) return false
  const id = (obj as unknown as Record<string, unknown>).__nodeId as string | undefined
  if (id?.endsWith('_wl')) return false
  const fid = (obj as unknown as Record<string, unknown>).__frameId as string | undefined
  if (fid != null && fid !== '') return false
  return true
}

/** Active object or single formattable Textbox inside an ActiveSelection (multi-select edge case). */
function resolveFormattableTextbox(fc: FabricCanvas | null | undefined): FabricTextbox | undefined {
  if (!fc) return undefined
  const obj = fc.getActiveObject()
  if (isFormattableTextbox(obj)) return obj

  if (obj instanceof ActiveSelection) {
    const format = obj.getObjects().filter((o) => isFormattableTextbox(o)) as FabricTextbox[]
    if (format.length === 1) return format[0]
    return undefined
  }

  return undefined
}

function readTextBarFromObject(obj: FabricObject | undefined): CanvasTextBarState | null {
  if (!isFormattableTextbox(obj)) return null
  const fill = obj.fill
  return {
    fontSize: obj.fontSize ?? 16,
    fontFamily: typeof obj.fontFamily === 'string' ? obj.fontFamily : 'system-ui, sans-serif',
    fontWeight: String(obj.fontWeight ?? 'normal'),
    fontStyle: String(obj.fontStyle ?? 'normal'),
    underline: !!obj.underline,
    fill: typeof fill === 'string' ? fill : '#212529',
  }
}

export function CanvasEditor({ path, onOpenNotePath }: { path: string; onOpenNotePath?: (path: string) => void }) {
  const { vaultFs } = useVaultSession()
  const canvasElRef = useRef<HTMLCanvasElement>(null)
  const fcRef = useRef<FabricCanvas | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<CanvasFile | null>(null)
  const pathRef = useRef(path)
  pathRef.current = path
  const undoRef = useRef(new CanvasUndoStack())
  const [undoState, setUndoState] = useState({ canUndo: false, canRedo: false })
  const [textBar, setTextBar] = useState<CanvasTextBarState | null>(null)
  const connectFromRef = useRef<{ obj: FabricObject; nodeId: string; ring: FabricObject | null } | null>(null)

  const activeTool = useCanvasStore((s) => s.activeTool)
  const strokeColor = useCanvasStore((s) => s.strokeColor)
  const strokeWidth = useCanvasStore((s) => s.strokeWidth)
  const strokeOpacity = useCanvasStore((s) => s.strokeOpacity)
  const markDirty = useCanvasStore((s) => s.markDirty)
  const markSaved = useCanvasStore((s) => s.markSaved)
  const registerFlushSave = useCanvasStore((s) => s.registerFlushSave)
  const resetStore = useCanvasStore((s) => s.reset)
  const isDirty = useCanvasStore((s) => s.isDirty)
  const isDirtyRef = useRef(isDirty)
  isDirtyRef.current = isDirty
  /** Ignore Fabric change events while initial file render is in progress (avoid spurious dirty). */
  const fabricBootstrapRef = useRef(true)

  /** Snapshot current state for undo, then mark dirty. */
  const snapshotAndDirty = useCallback(() => {
    if (fileRef.current) {
      syncFabricToFileStatic(fcRef.current, fileRef.current)
      undoRef.current.push(fileRef.current)
      setUndoState({ canUndo: undoRef.current.canUndo, canRedo: undoRef.current.canRedo })
    }
    markDirty()
  }, [markDirty])

  const applyTextStyle = useCallback(
    (patch: Partial<CanvasTextBarState>) => {
      const fc = fcRef.current
      const obj = resolveFormattableTextbox(fc)
      if (!obj) return
      const next: Record<string, unknown> = { ...patch }
      if (patch.fill !== undefined) next.fill = patch.fill
      if (patch.fontSize !== undefined) next.fontSize = patch.fontSize
      if (patch.fontFamily !== undefined) next.fontFamily = patch.fontFamily
      if (patch.fontWeight !== undefined) next.fontWeight = patch.fontWeight
      if (patch.fontStyle !== undefined) next.fontStyle = patch.fontStyle
      if (patch.underline !== undefined) next.underline = patch.underline
      obj.set(next)
      obj.initDimensions()
      obj.setCoords()
      fc!.requestRenderAll()
      setTextBar(readTextBarFromObject(obj))
      snapshotAndDirty()
    },
    [snapshotAndDirty],
  )

  /* ---- Load file + init Fabric ---- */
  useEffect(() => {
    const el = canvasElRef.current
    const ct = containerRef.current
    if (!el || !ct) return

    el.tabIndex = -1
    const fc = new FabricCanvas(el, {
      width: ct.clientWidth,
      height: ct.clientHeight,
      selection: true,
      backgroundColor: '#ffffff',
    })
    fcRef.current = fc

    function syncSelectionToTextBar() {
      const tb = resolveFormattableTextbox(fc)
      setTextBar(tb ? readTextBarFromObject(tb) : null)
    }
    function onTextEditEntered(opt: { target?: FabricObject }) {
      const t = opt.target
      setTextBar(isFormattableTextbox(t) ? readTextBarFromObject(t) : null)
    }
    function onTextEditExited() {
      const tb = resolveFormattableTextbox(fc)
      setTextBar(tb ? readTextBarFromObject(tb) : null)
    }
    function clearTextBarOnDeselect() {
      setTextBar(null)
    }

    fc.on('selection:created', syncSelectionToTextBar as never)
    fc.on('selection:updated', syncSelectionToTextBar as never)
    fc.on('selection:cleared', clearTextBarOnDeselect as never)
    fc.on('text:editing:entered', onTextEditEntered as never)
    fc.on('text:editing:exited', onTextEditExited as never)

    fabricBootstrapRef.current = true
    let cancelled = false
    const alive = () => !cancelled && fcRef.current === fc
    void (async () => {
      try {
        const raw = await vaultFs.readTextFile(path)
        const file = deserializeCanvas(raw)
        if (!alive()) return
        fileRef.current = file
        useCanvasStore.getState().setFile(cloneFile(file), path)
        renderCanvasFile(fc, file, alive)
        undoRef.current.clear()
        setUndoState({ canUndo: false, canRedo: false })
      } catch {
        if (!alive()) return
        fileRef.current = { version: 1, nodes: [], edges: [], frames: [] }
        useCanvasStore.getState().setFile(cloneFile(fileRef.current), path)
        renderCanvasFile(fc, fileRef.current, alive)
        undoRef.current.clear()
        setUndoState({ canUndo: false, canRedo: false })
      }
      if (!cancelled && fcRef.current === fc) {
        fabricBootstrapRef.current = false
        applyFabricToolModeFromStore(fc)
        requestAnimationFrame(() => {
          if (!cancelled && fcRef.current === fc) applyFabricToolModeFromStore(fc)
        })
      }
    })()

    function onResize() {
      if (!ct || cancelled) return
      fc.setDimensions({ width: ct.clientWidth, height: ct.clientHeight })
      fc.renderAll()
    }
    const ro = new ResizeObserver(onResize)
    ro.observe(ct)

    function markDirtyOnFabricChange() {
      if (fabricBootstrapRef.current) return
      markDirty()
    }
    function snapshotOnModified() {
      if (fabricBootstrapRef.current) return
      snapshotAndDirty()
    }
    fc.on('object:modified', snapshotOnModified as never)
    fc.on('object:scaling', markDirtyOnFabricChange as never)
    fc.on('object:rotating', markDirtyOnFabricChange as never)
    fc.on('text:changed', markDirtyOnFabricChange as never)

    fc.on('mouse:wheel', (opt) => {
      const e = opt.e as WheelEvent
      e.preventDefault()
      e.stopPropagation()
      let z = fc.getZoom() * (0.999 ** e.deltaY)
      z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z))
      fc.zoomToPoint(fc.getViewportPoint(e), z)
    })

    let isPanning = false
    let lastX = 0
    let lastY = 0

    fc.on('mouse:down', (opt) => {
      const e = opt.e as MouseEvent
      if (e.button === 1 || (e.altKey && e.button === 0)) {
        isPanning = true
        lastX = e.clientX
        lastY = e.clientY
        fc.selection = false
        e.preventDefault()
      }
    })
    fc.on('mouse:move', (opt) => {
      if (!isPanning) return
      const e = opt.e as MouseEvent
      const vpt = fc.viewportTransform
      if (!vpt) return
      vpt[4] += e.clientX - lastX
      vpt[5] += e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      fc.requestRenderAll()
    })
    fc.on('mouse:up', () => {
      if (isPanning) {
        isPanning = false
        fc.selection = true
      }
    })

    return () => {
      cancelled = true
      setTextBar(null)
      fc.off('selection:created', syncSelectionToTextBar as never)
      fc.off('selection:updated', syncSelectionToTextBar as never)
      fc.off('selection:cleared', clearTextBarOnDeselect as never)
      fc.off('text:editing:entered', onTextEditEntered as never)
      fc.off('text:editing:exited', onTextEditExited as never)
      fc.off('object:modified', snapshotOnModified as never)
      fc.off('object:scaling', markDirtyOnFabricChange as never)
      fc.off('object:rotating', markDirtyOnFabricChange as never)
      fc.off('text:changed', markDirtyOnFabricChange as never)
      ro.disconnect()
      if (isDirtyRef.current && fileRef.current) {
        try {
          syncFabricToFileStatic(fc, fileRef.current)
          const json = serializeCanvas(fileRef.current)
          void vaultFs.writeTextFile(pathRef.current, json).catch(() => {})
        } catch { /* best-effort */ }
      }
      fc.dispose()
      fcRef.current = null
      connectFromRef.current = null
      resetStore()
    }
  }, [path, vaultFs, resetStore, markDirty])

  /* ---- Tool switching (path in deps: new Fabric instance after navigate / rename) ---- */
  useEffect(() => {
    const fc = fcRef.current
    if (!fc) return
    applyFabricToolMode(fc, activeTool, strokeColor, strokeWidth, strokeOpacity)
    const id = requestAnimationFrame(() => {
      if (fcRef.current === fc) {
        applyFabricToolMode(fc, activeTool, strokeColor, strokeWidth, strokeOpacity)
      }
    })
    return () => cancelAnimationFrame(id)
  }, [path, activeTool, strokeColor, strokeWidth, strokeOpacity])

  /* ---- Drawing: path:created ---- */
  useEffect(() => {
    const fc = fcRef.current
    if (!fc) return

    function onPathCreated(e: { path?: import('fabric').Path }) {
      if (!e.path || !fileRef.current) return
      syncFabricToFileStatic(fcRef.current, fileRef.current)
      undoRef.current.push(cloneFile(fileRef.current))
      setUndoState({ canUndo: undoRef.current.canUndo, canRedo: undoRef.current.canRedo })

      const rawPath = e.path.path ?? []
      const pts: CanvasPath['points'] = rawPath.map((seg: unknown[]) => ({
        x: Number(seg[1]) || 0,
        y: Number(seg[2]) || 0,
        pressure: undefined,
      }))
      const bb = e.path.getBoundingRect()
      const pathColor = strokeOpacity < 1
        ? hexToRgba(strokeColor, strokeOpacity)
        : strokeColor
      const nodeId = generateNodeId()
      const node: CanvasDrawingNode = {
        id: nodeId,
        type: 'drawing',
        x: bb.left,
        y: bb.top,
        width: bb.width,
        height: bb.height,
        paths: [{ points: pts, strokeColor: pathColor, strokeWidth }],
      }
      ;(e.path as unknown as Record<string, unknown>).__nodeId = nodeId
      fileRef.current.nodes.push(node)
      markDirty()
    }
    fc.on('path:created', onPathCreated as never)
    return () => { fc.off('path:created', onPathCreated as never) }
  }, [strokeColor, strokeWidth, strokeOpacity, markDirty])

  function removeCanvasObject(canvas: FabricCanvas, obj: FabricObject) {
    const meta = obj as unknown as Record<string, unknown>
    const nid = meta.__nodeId as string | undefined
    const eid = meta.__edgeId as string | undefined
    const fid = meta.__frameId as string | undefined

    canvas.remove(obj)

    if (eid) {
      const siblings = canvas.getObjects().filter(
        (o) => (o as unknown as Record<string, unknown>).__edgeId === eid,
      )
      for (const s of siblings) canvas.remove(s)
      if (fileRef.current) {
        fileRef.current.edges = fileRef.current.edges.filter((e) => e.id !== eid)
      }
    }

    if (fid && fileRef.current) {
      const baseFrameId = fid.replace(/_label$/, '')
      fileRef.current.frames = fileRef.current.frames.filter((f) => f.id !== baseFrameId)
      const companions = canvas.getObjects().filter((o) => {
        const id = (o as unknown as Record<string, unknown>).__frameId as string | undefined
        return id === baseFrameId || id === baseFrameId + '_label'
      })
      for (const c of companions) canvas.remove(c)
    }

    if (nid && fileRef.current) {
      const baseId = nid.replace(/_(text|wl)$/, '')
      fileRef.current.nodes = fileRef.current.nodes.filter((n) => n.id !== baseId)
      const companions = canvas.getObjects().filter((o) => {
        const id = (o as unknown as Record<string, unknown>).__nodeId as string | undefined
        return id === baseId || id === baseId + '_text' || id === baseId + '_wl'
      })
      for (const c of companions) canvas.remove(c)
    }
  }

  /** Strip sub-object suffixes so edges always reference the canonical node id. */
  function canonicalNodeId(obj: FabricObject): string | undefined {
    const raw = (obj as unknown as Record<string, unknown>).__nodeId as string | undefined
    if (!raw) return undefined
    return raw.replace(/_(text|wl)$/, '')
  }

  /** Remove the visual ring placed on the first-click connect target. */
  function clearConnectRing(fc: FabricCanvas) {
    const ref = connectFromRef.current
    if (ref?.ring) {
      fc.remove(ref.ring)
      fc.requestRenderAll()
    }
    connectFromRef.current = null
  }

  /* ---- Text / Sticky / Erase / Connect click ---- */
  useEffect(() => {
    const fc = fcRef.current
    if (!fc) return
    const toolsHandled: string[] = ['text', 'sticky', 'erase', 'connect']
    if (!toolsHandled.includes(activeTool)) return

    // Clear stale connect state when switching away from connect tool
    if (activeTool !== 'connect') clearConnectRing(fc)

    let erasing = false
    let erasedAny = false

    function tryEraseAt(e: Event) {
      const target = fc!.findTarget(e)
      if (target) {
        removeCanvasObject(fc!, target)
        fc!.requestRenderAll()
        erasedAny = true
      }
    }

    function onEraseMove(e: TPointerEventInfo) {
      if (!erasing) return
      tryEraseAt(e.e)
    }

    function onEraseUp() {
      if (!erasing) return
      erasing = false
      if (erasedAny) snapshotAndDirty()
      erasedAny = false
    }

    function onClick(e: TPointerEventInfo) {
      /* --- Erase (drag-to-erase: down starts, move sweeps, up snapshots) --- */
      if (activeTool === 'erase') {
        erasing = true
        erasedAny = false
        tryEraseAt(e.e)
        return
      }

      /* --- Connector tool: click two objects --- */
      if (activeTool === 'connect') {
        const target = fc!.findTarget(e.e)
        if (!target) return
        const targetCanonId = canonicalNodeId(target)
        if (!targetCanonId) return

        if (!connectFromRef.current) {
          // First click: store source and add a visual ring
          const bb = target.getBoundingRect()
          const pad = 6
          const ring = new FabricRect({
            left: bb.left - pad,
            top: bb.top - pad,
            width: bb.width + pad * 2,
            height: bb.height + pad * 2,
            fill: 'transparent',
            stroke: '#e03131',
            strokeWidth: 2,
            strokeDashArray: [6, 3],
            rx: 4, ry: 4,
            selectable: false,
            evented: false,
          })
          fc!.add(ring)
          fc!.requestRenderAll()
          connectFromRef.current = { obj: target, nodeId: targetCanonId, ring }
          return
        }

        // Second click
        const fromId = connectFromRef.current.nodeId
        if (fromId === targetCanonId) {
          clearConnectRing(fc!)
          return
        }

        const fromCenter = connectFromRef.current.obj.getCenterPoint()
        const toCenter = target.getCenterPoint()
        const edgeId = generateNodeId()

        addArrowToCanvas(fc!, fromCenter.x, fromCenter.y, toCenter.x, toCenter.y, edgeId, strokeColor)

        const edge: CanvasEdge = {
          id: edgeId,
          fromNode: fromId,
          toNode: targetCanonId,
          color: strokeColor,
        }
        if (fileRef.current) fileRef.current.edges.push(edge)
        snapshotAndDirty()
        clearConnectRing(fc!)
        return
      }

      const p = fc!.getViewportPoint(e.e)
      const inv = fabricUtil.invertTransform(fc!.viewportTransform!)
      const pt = fabricUtil.transformPoint(new FabricPoint(p.x, p.y), inv)

      /* --- Text card --- */
      if (activeTool === 'text') {
        const nodeId = generateNodeId()
        const tb = new FabricTextbox('Type here…', {
          left: pt.x,
          top: pt.y,
          width: 200,
          fontSize: 16,
          fill: '#212529',
          editable: true,
          selectable: true,
          evented: true,
        })
        ;(tb as unknown as Record<string, unknown>).__nodeId = nodeId
        fc!.add(tb)
        fc!.setActiveObject(tb)
        useCanvasStore.getState().setActiveTool('select')
        applyFabricToolModeFromStore(fc!)
        tb.enterEditing()
        fc!.renderAll()
        setTextBar(readTextBarFromObject(tb))

        const node: CanvasTextNode = {
          id: nodeId, type: 'text', x: pt.x, y: pt.y, width: 200, height: 30, text: 'Type here…',
        }
        if (fileRef.current) fileRef.current.nodes.push(node)
        snapshotAndDirty()
      }

      /* --- Sticky note --- */
      if (activeTool === 'sticky') {
        const nodeId = generateNodeId()
        const colors = ['#fff3bf', '#d3f9d8', '#d0ebff', '#fcc2d7']
        const color = colors[Math.floor(Math.random() * colors.length)]!
        const size = 150
        const rect = new FabricRect({
          left: pt.x, top: pt.y, width: size, height: size,
          fill: color, rx: 6, ry: 6,
          selectable: true, evented: true,
          shadow: new FabricShadow({ color: 'rgba(0,0,0,0.12)', blur: 6, offsetX: 2, offsetY: 2 }),
        })
        ;(rect as unknown as Record<string, unknown>).__nodeId = nodeId
        fc!.add(rect)

        const tb = new FabricTextbox('Note…', {
          left: pt.x + 10, top: pt.y + 10, width: size - 20,
          fontSize: 14, fill: '#212529', editable: true, selectable: true, evented: true,
        })
        ;(tb as unknown as Record<string, unknown>).__nodeId = nodeId + '_text'
        fc!.add(tb)
        useCanvasStore.getState().setActiveTool('select')
        applyFabricToolModeFromStore(fc!)
        fc!.setActiveObject(tb)
        tb.enterEditing()
        fc!.renderAll()
        setTextBar(readTextBarFromObject(tb))

        const node: CanvasStickyNode = {
          id: nodeId, type: 'sticky', x: pt.x, y: pt.y,
          width: size, height: size, text: 'Note…', color,
        }
        if (fileRef.current) fileRef.current.nodes.push(node)
        snapshotAndDirty()
      }
    }

    fc.on('mouse:down', onClick)
    if (activeTool === 'erase') {
      fc.on('mouse:move', onEraseMove)
      fc.on('mouse:up', onEraseUp)
    }
    return () => {
      fc.off('mouse:down', onClick)
      fc.off('mouse:move', onEraseMove)
      fc.off('mouse:up', onEraseUp)
    }
  }, [activeTool, strokeColor, snapshotAndDirty])

  /* ---- Add image ---- */
  const handleAddImage = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        const fc = fcRef.current
        if (!fc) return
        void FabricImage.fromURL(dataUrl).then((img) => {
          if (fcRef.current !== fc) return
          const maxW = 400
          const scale = img.width && img.width > maxW ? maxW / img.width : 1
          img.set({ left: 100, top: 100, scaleX: scale, scaleY: scale, selectable: true, evented: true })
          const nodeId = generateNodeId()
          ;(img as unknown as Record<string, unknown>).__nodeId = nodeId
          fc.add(img)
          applyFabricToolModeFromStore(fc)
          fc.renderAll()
          const node: CanvasImageNode = {
            id: nodeId, type: 'image', x: 100, y: 100,
            width: (img.width ?? 100) * scale, height: (img.height ?? 100) * scale, src: dataUrl,
          }
          if (fileRef.current) fileRef.current.nodes.push(node)
          snapshotAndDirty()
        }).catch(() => {})
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }, [snapshotAndDirty])

  /* ---- Add frame (section) ---- */
  const handleAddFrame = useCallback(() => {
    const fc = fcRef.current
    if (!fc) return
    const frameId = generateNodeId()
    const w = 400
    const h = 300
    const rect = new FabricRect({
      left: 50, top: 50, width: w, height: h,
      fill: 'rgba(100,149,237,0.06)',
      stroke: '#4c6ef5', strokeWidth: 1.5,
      strokeDashArray: [8, 4],
      rx: 8, ry: 8,
      selectable: true, evented: true,
    })
    ;(rect as unknown as Record<string, unknown>).__frameId = frameId
    fc.add(rect)
    fc.sendObjectToBack(rect)

    const label = new FabricTextbox('Section', {
      left: 58, top: 55, width: w - 20,
      fontSize: 12, fill: '#4c6ef5', fontWeight: 'bold',
      selectable: true, evented: true,
    })
    ;(label as unknown as Record<string, unknown>).__frameId = frameId + '_label'
    fc.add(label)
    applyFabricToolModeFromStore(fc)
    fc.renderAll()

    const frame: CanvasFrame = { id: frameId, label: 'Section', x: 50, y: 50, width: w, height: h }
    if (fileRef.current) fileRef.current.frames.push(frame)
    snapshotAndDirty()
  }, [snapshotAndDirty])

  /* ---- Wiki-link double-click navigation (existing cards only) ---- */
  useEffect(() => {
    const fc = fcRef.current
    if (!fc || !onOpenNotePath) return

    function onDblClick(e: TPointerEventInfo) {
      const target = fc!.findTarget(e.e)
      if (!target) return
      const wikiTarget = (target as unknown as Record<string, unknown>).__wikiTarget as string | undefined
      if (!wikiTarget) return

      void (async () => {
        try {
          const paths = await collectMarkdownPaths(vaultFs)
          const resolved = resolveWikiLinkPath(wikiTarget, paths)
          if (resolved) onOpenNotePath!(resolved)
          else toast.warning(`Note "${wikiTarget}" not found`)
        } catch { /* noop */ }
      })()
    }

    fc.on('mouse:dblclick', onDblClick as never)
    return () => { fc.off('mouse:dblclick', onDblClick as never) }
  }, [onOpenNotePath, vaultFs])

  /* ---- Save ---- */
  const handleSave = useCallback(async () => {
    if (!fileRef.current) return
    setSaving(true)
    try {
      syncFabricToFile()
      const json = serializeCanvas(fileRef.current)
      await vaultFs.writeTextFile(pathRef.current, json)
      markSaved()
    } catch (e) {
      console.error('Canvas save failed', e)
      toast.error('Failed to save canvas')
    } finally {
      setSaving(false)
    }
  }, [vaultFs, markSaved])

  useEffect(() => {
    registerFlushSave(handleSave)
    return () => registerFlushSave(null)
  }, [handleSave, registerFlushSave])

  const handleUndo = useCallback(() => {
    if (!fileRef.current) return
    syncFabricToFileStatic(fcRef.current, fileRef.current)
    const prev = undoRef.current.undo(fileRef.current)
    if (!prev) return
    fileRef.current = prev
    useCanvasStore.getState().setFile(cloneFile(prev), path)
    const fc = fcRef.current
    if (fc) {
      renderCanvasFile(fc, prev, () => fcRef.current === fc)
      applyFabricToolModeFromStore(fc)
    }
    setUndoState({ canUndo: undoRef.current.canUndo, canRedo: undoRef.current.canRedo })
    markDirty()
  }, [path, markDirty])

  const handleRedo = useCallback(() => {
    if (!fileRef.current) return
    syncFabricToFileStatic(fcRef.current, fileRef.current)
    const next = undoRef.current.redo(fileRef.current)
    if (!next) return
    fileRef.current = next
    useCanvasStore.getState().setFile(cloneFile(next), path)
    const fc = fcRef.current
    if (fc) {
      renderCanvasFile(fc, next, () => fcRef.current === fc)
      applyFabricToolModeFromStore(fc)
    }
    setUndoState({ canUndo: undoRef.current.canUndo, canRedo: undoRef.current.canRedo })
    markDirty()
  }, [path, markDirty])

  /* ---- Canvas keyboard shortcuts ---- */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        void handleSave()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
        return
      }
      if ((e.metaKey || e.ctrlKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
        e.preventDefault()
        handleRedo()
        return
      }
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

      const toolMap: Record<string, typeof activeTool> = {
        v: 'select', p: 'draw', t: 'text', n: 'sticky', c: 'connect', e: 'erase',
      }
      const tool = toolMap[e.key]
      if (tool) {
        useCanvasStore.getState().setActiveTool(tool)
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const fc = fcRef.current
        if (!fc) return
        const active = fc.getActiveObjects()
        for (const obj of active) removeCanvasObject(fc, obj)
        fc.discardActiveObject()
        fc.renderAll()
        if (active.length > 0) snapshotAndDirty()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleSave, handleUndo, handleRedo, activeTool, snapshotAndDirty])

  /* ---- Auto-save (interval + tab hidden + window blur) ---- */
  useEffect(() => {
    const timer = setInterval(() => {
      if (isDirtyRef.current) void handleSave()
    }, AUTOSAVE_INTERVAL)

    function onBlur() {
      if (isDirtyRef.current) void handleSave()
    }
    function onVisibility() {
      if (document.visibilityState === 'hidden' && isDirtyRef.current) void handleSave()
    }
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      clearInterval(timer)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [handleSave])

  /* ---- Export to PNG ---- */
  const handleExportPng = useCallback(() => {
    const fc = fcRef.current
    if (!fc) return
    const dataUrl = fc.toDataURL({ format: 'png', multiplier: 2 })
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = (path.split('/').pop()?.replace(/\.canvas$/, '') ?? 'canvas') + '.png'
    a.click()
  }, [path])

  /* ---- Export to PDF (via canvas → image → pdf-lib) ---- */
  const handleExportPdf = useCallback(async () => {
    const fc = fcRef.current
    if (!fc) return
    const { PDFDocument } = await import('pdf-lib')
    const dataUrl = fc.toDataURL({ format: 'png', multiplier: 2 })
    const base64 = dataUrl.split(',')[1] ?? ''
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

    const doc = await PDFDocument.create()
    const img = await doc.embedPng(bytes)
    const { width: iw, height: ih } = img.scale(1)
    const maxW = 595
    const scale = iw > maxW ? maxW / iw : 1
    const page = doc.addPage([iw * scale, ih * scale])
    page.drawImage(img, { x: 0, y: 0, width: iw * scale, height: ih * scale })
    const pdfBytes = await doc.save()

    const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = (path.split('/').pop()?.replace(/\.canvas$/, '') ?? 'canvas') + '.pdf'
    a.click()
    URL.revokeObjectURL(a.href)
  }, [path])

  function syncFabricToFile() {
    syncFabricToFileStatic(fcRef.current, fileRef.current)
  }

  return (
    <div ref={containerRef} className="relative h-full min-h-0">
      <canvas ref={canvasElRef} aria-label="Canvas drawing area" role="application" />
      <CanvasToolbar
        onAddImage={handleAddImage}
        onExportPng={handleExportPng}
        onExportPdf={() => void handleExportPdf()}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={undoState.canUndo}
        canRedo={undoState.canRedo}
        textBar={textBar}
        onTextStyleChange={applyTextStyle}
      />
    </div>
  )
}

/* ---- Arrow helper ---- */
function addArrowToCanvas(
  fc: FabricCanvas, x1: number, y1: number, x2: number, y2: number,
  edgeId: string, color: string,
) {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const headLen = 10

  const line = new FabricLine([x1, y1, x2, y2], {
    stroke: color, strokeWidth: 2, selectable: false, evented: false,
  })
  ;(line as unknown as Record<string, unknown>).__edgeId = edgeId

  const head = new FabricTriangle({
    left: x2, top: y2, width: headLen, height: headLen,
    fill: color, angle: (angle * 180) / Math.PI + 90,
    originX: 'center', originY: 'center',
    selectable: false, evented: false,
  })
  ;(head as unknown as Record<string, unknown>).__edgeId = edgeId

  fc.add(line, head)
}

/* ---- Sync Fabric positions back to the CanvasFile data model ---- */
function syncFabricToFileStatic(fc: FabricCanvas | null, file: CanvasFile | null) {
  if (!fc || !file) return
  fc.forEachObject((obj) => {
    const rawId = (obj as unknown as Record<string, unknown>).__nodeId as string | undefined
    if (rawId) {
      const isStickyText = rawId.endsWith('_text')
      const isWikiLabel = rawId.endsWith('_wl')
      const nodeId = isStickyText ? rawId.slice(0, -5) : isWikiLabel ? rawId.slice(0, -3) : rawId
      const node = file.nodes.find((n) => n.id === nodeId)
      if (!node) return

      if (isStickyText) {
        if (node.type === 'sticky' && obj instanceof FabricTextbox) {
          node.text = obj.text ?? node.text
        }
        return
      }
      if (isWikiLabel) return

      node.x = obj.left ?? node.x
      node.y = obj.top ?? node.y
      if (node.type === 'text' && obj instanceof FabricTextbox) {
        node.text = obj.text ?? node.text
        node.width = obj.width ?? node.width
        const f = obj.fill
        if (typeof f === 'string') node.color = f
        if (obj.fontSize != null) node.fontSize = obj.fontSize
        if (typeof obj.fontFamily === 'string') node.fontFamily = obj.fontFamily
        if (obj.fontWeight != null) node.fontWeight = obj.fontWeight as string | number
        if (obj.fontStyle != null) node.fontStyle = obj.fontStyle as string
        if (obj.underline != null) node.underline = obj.underline
      }
      if (node.type === 'sticky') {
        node.width = (obj.width ?? node.width) * (obj.scaleX ?? 1)
        node.height = (obj.height ?? node.height) * (obj.scaleY ?? 1)
      }
      if (node.type === 'image') {
        node.width = (obj.width ?? node.width) * (obj.scaleX ?? 1)
        node.height = (obj.height ?? node.height) * (obj.scaleY ?? 1)
      }
      return
    }

    const frameId = (obj as unknown as Record<string, unknown>).__frameId as string | undefined
    if (frameId && !frameId.endsWith('_label')) {
      const frame = file.frames.find((f) => f.id === frameId)
      if (frame) {
        frame.x = obj.left ?? frame.x
        frame.y = obj.top ?? frame.y
        frame.width = (obj.width ?? frame.width) * (obj.scaleX ?? 1)
        frame.height = (obj.height ?? frame.height) * (obj.scaleY ?? 1)
      }
    }
  })
}

/* ---- Render a CanvasFile onto a Fabric.js canvas ---- */
function renderCanvasFile(fc: FabricCanvas, file: CanvasFile, isAlive?: () => boolean) {
  try {
    fc.clear()
  } catch {
    return
  }
  fc.backgroundColor = '#ffffff'

  /* Frames first (behind everything) */
  for (const frame of file.frames) {
    const rect = new FabricRect({
      left: frame.x, top: frame.y, width: frame.width, height: frame.height,
      fill: 'rgba(100,149,237,0.06)',
      stroke: frame.color ?? '#4c6ef5', strokeWidth: 1.5,
      strokeDashArray: [8, 4], rx: 8, ry: 8,
      selectable: true, evented: true,
    })
    ;(rect as unknown as Record<string, unknown>).__frameId = frame.id
    fc.add(rect)

    const label = new FabricTextbox(frame.label, {
      left: frame.x + 8, top: frame.y + 5, width: frame.width - 20,
      fontSize: 12, fill: frame.color ?? '#4c6ef5', fontWeight: 'bold',
      selectable: true, evented: true,
    })
    ;(label as unknown as Record<string, unknown>).__frameId = frame.id + '_label'
    fc.add(label)
  }

  for (const node of file.nodes) {
    if (node.type === 'text') {
      const tb = new FabricTextbox(node.text, {
        left: node.x, top: node.y, width: node.width,
        fontSize: node.fontSize ?? 16,
        fill: node.color ?? '#212529',
        fontFamily: node.fontFamily,
        fontWeight: node.fontWeight as number | string | undefined,
        fontStyle: node.fontStyle,
        underline: node.underline,
        editable: true,
        selectable: true, evented: true,
      })
      ;(tb as unknown as Record<string, unknown>).__nodeId = node.id
      fc.add(tb)
    }

    if (node.type === 'sticky') {
      const rect = new FabricRect({
        left: node.x, top: node.y, width: node.width, height: node.height,
        fill: node.color, rx: 6, ry: 6,
        selectable: true, evented: true,
        shadow: new FabricShadow({ color: 'rgba(0,0,0,0.12)', blur: 6, offsetX: 2, offsetY: 2 }),
      })
      ;(rect as unknown as Record<string, unknown>).__nodeId = node.id
      fc.add(rect)

      const tb = new FabricTextbox(node.text, {
        left: node.x + 10, top: node.y + 10, width: node.width - 20,
        fontSize: 14, fill: '#212529', editable: true, selectable: true, evented: true,
      })
      ;(tb as unknown as Record<string, unknown>).__nodeId = node.id + '_text'
      fc.add(tb)
    }

    if (node.type === 'image') {
      void FabricImage.fromURL(node.src).then((img) => {
        if (isAlive && !isAlive()) return
        const scale = node.width / (img.width ?? 100)
        img.set({
          left: node.x, top: node.y, scaleX: scale, scaleY: scale,
          selectable: true, evented: true,
        })
        ;(img as unknown as Record<string, unknown>).__nodeId = node.id
        fc.add(img)
        applyFabricToolModeFromStore(fc)
        fc.renderAll()
      }).catch(() => {})
    }

    if (node.type === 'drawing') {
      for (const canvasPath of node.paths) {
        if (canvasPath.points.length < 2) continue
        const d = canvasPath.points
          .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`)
          .join(' ')
        const fp = new FabricPath(d, {
          stroke: canvasPath.strokeColor, strokeWidth: canvasPath.strokeWidth,
          fill: '', selectable: true, evented: true,
        })
        ;(fp as unknown as Record<string, unknown>).__nodeId = node.id
        fc.add(fp)
      }
    }

    if (node.type === 'wiki-link') {
      const w = node.width || 180
      const h = node.height || 32
      const rect = new FabricRect({
        left: node.x, top: node.y, width: w, height: h,
        fill: '#e7f5ff', stroke: '#1971c2', strokeWidth: 1,
        rx: 4, ry: 4, selectable: true, evented: true,
      })
      ;(rect as unknown as Record<string, unknown>).__nodeId = node.id
      ;(rect as unknown as Record<string, unknown>).__wikiTarget = node.target
      fc.add(rect)

      const label = node.alias ?? node.target
      const tb = new FabricTextbox(`[[${label}]]`, {
        left: node.x + 8, top: node.y + 6, width: w - 20,
        fontSize: 13, fill: '#1971c2', selectable: true, evented: true,
      })
      ;(tb as unknown as Record<string, unknown>).__nodeId = node.id + '_wl'
      ;(tb as unknown as Record<string, unknown>).__wikiTarget = node.target
      fc.add(tb)
    }
  }

  /* Edges (connectors / arrows) — normalize IDs to strip any _text/_wl suffix from old saves */
  for (const edge of file.edges) {
    edge.fromNode = edge.fromNode.replace(/_(text|wl)$/, '')
    edge.toNode = edge.toNode.replace(/_(text|wl)$/, '')
    const fromNode = file.nodes.find((n) => n.id === edge.fromNode)
    const toNode = file.nodes.find((n) => n.id === edge.toNode)
    if (!fromNode || !toNode) continue

    const x1 = fromNode.x + fromNode.width / 2
    const y1 = fromNode.y + fromNode.height / 2
    const x2 = toNode.x + toNode.width / 2
    const y2 = toNode.y + toNode.height / 2

    addArrowToCanvas(fc, x1, y1, x2, y2, edge.id, edge.color ?? '#868e96')
  }

  /* fc.clear() and new objects default to selectable; re-sync store tool (draw vs select). */
  applyFabricToolModeFromStore(fc)
  fc.renderAll()
}
