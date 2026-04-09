'use client'

import { useEffect, useRef, useState } from 'react'
import type { PDFPageProxy } from 'pdfjs-dist'
import {
  Canvas as FabricCanvas,
  PencilBrush,
  Rect as FabricRect,
  Path as FabricPath,
  Textbox as FabricTextbox,
  FabricImage,
} from 'fabric'
import type { FabricObject, TPointerEventInfo } from 'fabric'
import { usePdfStore } from '@/stores/pdf'
import { PdfTool, PdfAnnotationType } from '@/types/pdf'
import type {
  PdfAnnotation,
  PdfHighlight,
  PdfInkAnnotation,
  PdfFreeText,
  PdfStamp,
  PdfTextComment,
} from '@/types/pdf'
import { fabricPathCommandsToPdfPoints } from '@/lib/pdf/fabric-path-to-pdf-points'

interface Props {
  page: PDFPageProxy
  pageIndex: number
  zoom: number
  existingAnnotations: PdfAnnotation[]
  /** Data-URL for the signature to stamp when tool = Sign. */
  signatureDataUrl?: string | null
  /** In-document text search highlights (viewport px at current zoom). */
  searchHighlights?: Array<{ x: number; y: number; width: number; height: number; active: boolean }>
}

export function PdfPageCanvas({
  page,
  pageIndex,
  zoom,
  existingAnnotations,
  signatureDataUrl,
  searchHighlights = [],
}: Props) {
  const renderRef = useRef<HTMLCanvasElement>(null)
  const fabricRef = useRef<HTMLCanvasElement>(null)
  const fcRef = useRef<FabricCanvas | null>(null)
  const [ready, setReady] = useState(false)

  const activeTool = usePdfStore((s) => s.activeTool)
  const highlightColor = usePdfStore((s) => s.highlightColor)
  const drawColor = usePdfStore((s) => s.drawColor)
  const textColor = usePdfStore((s) => s.textColor)
  const strokeWidth = usePdfStore((s) => s.strokeWidth)
  const addAnnotation = usePdfStore((s) => s.addAnnotation)

  const vp = page.getViewport({ scale: zoom })
  const w = Math.floor(vp.width)
  const h = Math.floor(vp.height)

  useEffect(() => {
    const rc = renderRef.current
    if (!rc) return
    const ctx = rc.getContext('2d')!
    rc.width = w
    rc.height = h
    let cancel = false
    const task = page.render({ canvasContext: ctx, viewport: vp })
    task.promise.then(() => {
      if (!cancel) setReady(true)
    }).catch(() => {})
    return () => {
      cancel = true
      task.cancel()
    }
    // vp is derived from page + zoom (both listed); w/h derived from vp
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, w, h, zoom])

  useEffect(() => {
    const el = fabricRef.current
    if (!el || !ready) return
    const fc = new FabricCanvas(el, {
      width: w,
      height: h,
      selection: false,
    })
    fcRef.current = fc

    for (const ann of existingAnnotations) {
      if (ann.type === PdfAnnotationType.Highlight) {
        const hl = ann as PdfHighlight
        const r = new FabricRect({
          left: hl.rect.x * zoom,
          top: hl.rect.y * zoom,
          width: hl.rect.width * zoom,
          height: hl.rect.height * zoom,
          fill: hl.color ?? '#fff3bf',
          opacity: 0.35,
          selectable: activeTool === PdfTool.Select,
          evented: activeTool === PdfTool.Select,
        })
        ;(r as unknown as Record<string, unknown>).__annId = ann.id
        fc.add(r)
      }
      if (ann.type === PdfAnnotationType.Ink) {
        const ink = ann as PdfInkAnnotation
        for (const path of ink.paths) {
          if (path.points.length < 2) continue
          const d = path.points
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * zoom} ${p.y * zoom}`)
            .join(' ')
          const fp = new FabricPath(d, {
            stroke: ink.strokeColor,
            strokeWidth: ink.strokeWidth * zoom,
            fill: '',
            selectable: activeTool === PdfTool.Select,
            evented: activeTool === PdfTool.Select,
          })
          ;(fp as unknown as Record<string, unknown>).__annId = ann.id
          fc.add(fp)
        }
      }
      if (ann.type === PdfAnnotationType.FreeText) {
        const ft = ann as PdfFreeText
        const tb = new FabricTextbox(ft.text, {
          left: ft.rect.x * zoom,
          top: ft.rect.y * zoom,
          width: ft.rect.width * zoom,
          fontSize: ft.fontSize * zoom,
          fill: ft.fontColor,
          editable: true,
          selectable: activeTool === PdfTool.Select,
          evented: activeTool === PdfTool.Select,
        })
        ;(tb as unknown as Record<string, unknown>).__annId = ann.id
        fc.add(tb)
      }
      if (ann.type === PdfAnnotationType.Stamp) {
        const st = ann as PdfStamp
        void FabricImage.fromURL(st.imageData).then((img) => {
          img.set({
            left: st.rect.x * zoom,
            top: st.rect.y * zoom,
            scaleX: (st.rect.width * zoom) / (img.width ?? 100),
            scaleY: (st.rect.height * zoom) / (img.height ?? 50),
            selectable: activeTool === PdfTool.Select,
            evented: activeTool === PdfTool.Select,
          })
          ;(img as unknown as Record<string, unknown>).__annId = ann.id
          fc.add(img)
          fc.renderAll()
        })
      }
      if (ann.type === PdfAnnotationType.Text) {
        const tc = ann as PdfTextComment
        const r = new FabricRect({
          left: tc.rect.x * zoom,
          top: tc.rect.y * zoom,
          width: 18 * zoom,
          height: 18 * zoom,
          fill: '#ffe066',
          stroke: '#fab005',
          strokeWidth: 1,
          rx: 3,
          ry: 3,
          selectable: activeTool === PdfTool.Select,
          evented: activeTool === PdfTool.Select,
        })
        ;(r as unknown as Record<string, unknown>).__annId = ann.id
        fc.add(r)
      }
    }

    for (const sh of searchHighlights) {
      const r = new FabricRect({
        left: sh.x,
        top: sh.y,
        width: sh.width,
        height: sh.height,
        fill: sh.active ? '#339af0' : '#94d82d',
        opacity: sh.active ? 0.42 : 0.28,
        selectable: false,
        evented: false,
      })
      ;(r as unknown as Record<string, unknown>).__searchHl = true
      fc.add(r)
    }

    fc.renderAll()

    function syncFreeTextFromFabric(target: FabricObject | undefined) {
      if (!target) return
      const id = (target as unknown as Record<string, unknown>).__annId as string | undefined
      if (!id) return
      const match = usePdfStore.getState().annotations.find((a) => a.id === id)
      if (!match || match.type !== PdfAnnotationType.FreeText) return
      const ft = match as PdfFreeText
      const tb = target as InstanceType<typeof FabricTextbox>
      const fontSizePdf = (Number(tb.fontSize) || ft.fontSize * zoom) / zoom
      usePdfStore.getState().updateAnnotation(id, {
        text: tb.text ?? '',
        fontSize: fontSizePdf,
        rect: {
          x: (tb.left ?? 0) / zoom,
          y: (tb.top ?? 0) / zoom,
          width: (tb.width ?? ft.rect.width * zoom) / zoom,
          height: Math.max(ft.rect.height, (Number(tb.height) || 0) / zoom),
        },
        modifiedAt: new Date().toISOString(),
      } as unknown as Partial<PdfFreeText>)
    }

    function syncStampFromFabric(target: FabricObject | undefined) {
      if (!target) return
      const id = (target as unknown as Record<string, unknown>).__annId as string | undefined
      if (!id) return
      const match = usePdfStore.getState().annotations.find((a) => a.id === id)
      if (!match || match.type !== PdfAnnotationType.Stamp) return
      const img = target as InstanceType<typeof FabricImage>
      const iw = img.width ?? 100
      const ih = img.height ?? 50
      const dispW = iw * (Number(img.scaleX) || 1)
      const dispH = ih * (Number(img.scaleY) || 1)
      usePdfStore.getState().updateAnnotation(id, {
        rect: {
          x: (img.left ?? 0) / zoom,
          y: (img.top ?? 0) / zoom,
          width: dispW / zoom,
          height: dispH / zoom,
        },
        modifiedAt: new Date().toISOString(),
      } as Partial<PdfStamp>)
    }

    const onSyncFreeText = (opt: { target?: FabricObject }) => syncFreeTextFromFabric(opt.target)
    const onObjectModified = (opt: { target?: FabricObject }) => {
      syncFreeTextFromFabric(opt.target)
      syncStampFromFabric(opt.target)
    }
    fc.on('text:editing:exited', onSyncFreeText)
    fc.on('object:modified', onObjectModified)

    return () => {
      fc.off('text:editing:exited', onSyncFreeText)
      fc.off('object:modified', onObjectModified)
      fc.dispose()
      fcRef.current = null
    }
  }, [ready, page, w, h, existingAnnotations, zoom, activeTool, searchHighlights])

  useEffect(() => {
    const fc = fcRef.current
    if (!fc) return

    if (activeTool === PdfTool.Draw) {
      fc.isDrawingMode = true
      const brush = new PencilBrush(fc)
      brush.color = drawColor
      brush.width = strokeWidth * zoom
      fc.freeDrawingBrush = brush
    } else {
      fc.isDrawingMode = false
    }

    fc.forEachObject((obj) => {
      if ((obj as unknown as Record<string, unknown>).__searchHl) return
      obj.selectable = activeTool === PdfTool.Select
      obj.evented = activeTool === PdfTool.Select
    })
    fc.renderAll()
  }, [activeTool, drawColor, strokeWidth, zoom])

  useEffect(() => {
    const fc = fcRef.current
    if (!fc) return

    function onPathCreated(e: { path?: FabricPath }) {
      if (!e.path) return
      const path = e.path
      const pts = fabricPathCommandsToPdfPoints(
        (path.path ?? []) as ReadonlyArray<ReadonlyArray<string | number>>,
        zoom,
      )
      if (pts.length < 2) return
      const bb = path.getBoundingRect()
      const ann: PdfInkAnnotation = {
        id: crypto.randomUUID(),
        type: PdfAnnotationType.Ink,
        pageIndex,
        rect: {
          x: bb.left / zoom,
          y: bb.top / zoom,
          width: bb.width / zoom,
          height: bb.height / zoom,
        },
        paths: [{ points: pts }],
        strokeColor: drawColor,
        strokeWidth,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
      }
      addAnnotation(ann)
    }

    fc.on('path:created', onPathCreated as never)
    return () => {
      fc.off('path:created', onPathCreated as never)
    }
  }, [pageIndex, drawColor, strokeWidth, zoom, addAnnotation])

  useEffect(() => {
    const fc = fcRef.current
    if (!fc || activeTool !== PdfTool.Highlight) return

    let startX = 0
    let startY = 0
    let rect: FabricRect | null = null

    function onMouseDown(e: TPointerEventInfo) {
      const p = fc!.getViewportPoint(e.e)
      startX = p.x
      startY = p.y
      rect = new FabricRect({
        left: startX,
        top: startY,
        width: 0,
        height: 0,
        fill: highlightColor,
        opacity: 0.35,
        selectable: false,
        evented: false,
      })
      fc!.add(rect)
    }

    function onMouseMove(e: TPointerEventInfo) {
      if (!rect) return
      const p = fc!.getViewportPoint(e.e)
      const x = Math.min(startX, p.x)
      const y = Math.min(startY, p.y)
      rect.set({ left: x, top: y, width: Math.abs(p.x - startX), height: Math.abs(p.y - startY) })
      fc!.renderAll()
    }

    function onMouseUp() {
      if (!rect) return
      const rw = rect.width ?? 0
      const rh = rect.height ?? 0
      if (rw < 4 && rh < 4) {
        fc!.remove(rect)
        rect = null
        return
      }
      const ann: PdfHighlight = {
        id: crypto.randomUUID(),
        type: PdfAnnotationType.Highlight,
        pageIndex,
        rect: {
          x: (rect.left ?? 0) / zoom,
          y: (rect.top ?? 0) / zoom,
          width: rw / zoom,
          height: rh / zoom,
        },
        color: highlightColor,
        quadPoints: [],
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
      }
      addAnnotation(ann)
      rect = null
    }

    fc.on('mouse:down', onMouseDown)
    fc.on('mouse:move', onMouseMove)
    fc.on('mouse:up', onMouseUp)
    return () => {
      fc.off('mouse:down', onMouseDown)
      fc.off('mouse:move', onMouseMove)
      fc.off('mouse:up', onMouseUp)
    }
  }, [activeTool, highlightColor, pageIndex, zoom, addAnnotation])

  /* ------- Text box (FreeText) tool: click to place ------- */
  useEffect(() => {
    const fc = fcRef.current
    if (!fc || activeTool !== PdfTool.Text) return

    function onClick(e: TPointerEventInfo) {
      const p = fc!.getViewportPoint(e.e)
      const defaultWidth = 200
      const fontSize = 14
      const text = 'Type here…'
      const ann: PdfFreeText = {
        id: crypto.randomUUID(),
        type: PdfAnnotationType.FreeText,
        pageIndex,
        rect: { x: p.x / zoom, y: p.y / zoom, width: defaultWidth / zoom, height: 24 / zoom },
        text,
        fontSize,
        fontColor: textColor,
        color: undefined,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
      }
      addAnnotation(ann)
      // Match canvas: switch to Select so the new box is movable; double-click to edit (P3).
      usePdfStore.getState().setActiveTool(PdfTool.Select)
    }

    fc.on('mouse:down', onClick)
    return () => { fc.off('mouse:down', onClick) }
  }, [activeTool, textColor, pageIndex, zoom, addAnnotation])

  /* ------- Comment tool: open dialog via store (see PdfViewer) ------- */
  useEffect(() => {
    const fc = fcRef.current
    if (!fc || activeTool !== PdfTool.Comment) return

    function onClick(e: TPointerEventInfo) {
      const p = fc!.getViewportPoint(e.e)
      usePdfStore.getState().setPendingPdfComment({
        pageIndex,
        anchorPdfX: p.x / zoom,
        anchorPdfY: p.y / zoom,
      })
    }

    fc.on('mouse:down', onClick)
    return () => {
      fc.off('mouse:down', onClick)
    }
  }, [activeTool, pageIndex, zoom])

  /* ------- Signature stamp tool ------- */
  useEffect(() => {
    const fc = fcRef.current
    if (!fc || activeTool !== PdfTool.Sign || !signatureDataUrl) return

    function onClick(e: TPointerEventInfo) {
      const p = fc!.getViewportPoint(e.e)
      const stampW = 150
      const stampH = 60
      const ann: PdfStamp = {
        id: crypto.randomUUID(),
        type: PdfAnnotationType.Stamp,
        pageIndex,
        rect: { x: p.x / zoom, y: p.y / zoom, width: stampW / zoom, height: stampH / zoom },
        imageData: signatureDataUrl!,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
      }
      addAnnotation(ann)
      usePdfStore.getState().setActiveTool(PdfTool.Select)
    }

    fc.on('mouse:down', onClick)
    return () => { fc.off('mouse:down', onClick) }
  }, [activeTool, signatureDataUrl, pageIndex, zoom, addAnnotation])

  return (
    <div className="relative" style={{ width: w, height: h }}>
      <canvas ref={renderRef} className="absolute inset-0" style={{ width: w, height: h }} aria-label="PDF page background" aria-hidden />
      <canvas ref={fabricRef} className="absolute inset-0" style={{ width: w, height: h }} aria-label="Annotation layer" role="application" />
    </div>
  )
}
