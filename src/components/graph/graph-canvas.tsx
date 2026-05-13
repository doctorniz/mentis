'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { GraphNode, GraphEdge } from '@/lib/graph/build-graph'

interface Props {
  nodes: GraphNode[]
  edges: GraphEdge[]
  onClickNode?: (nodeId: string) => void
}

// Lucide icon SVG paths (24×24 viewBox) — same icons as the file tree
const ICON_SVG: Record<string, string> = {
  // FileText
  note: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>`,
  // FileText (same base — red color differentiates)
  pdf: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>`,
  // Layout
  canvas: `<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>`,
  // Presentation
  pptx: `<line x1="22" y1="3" x2="2" y2="3"/><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/><path d="m8 21 4-4 4 4"/>`,
  // FileType2 (document with type indicator)
  docx: `<path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4"/><polyline points="14 2 14 8 20 8"/><path d="M2 13v-1h6v1"/><path d="M4 18h2"/><path d="M5 12v6"/>`,
  // Table2
  spreadsheet: `<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>`,
  // FileCode2
  code: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="m10 13-2 2 2 2"/><path d="m14 17 2-2-2-2"/>`,
}

function makeIconUrl(svgPaths: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${svgPaths}</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const MIN_RADIUS = 6
const MAX_RADIUS = 22
const LABEL_OFFSET = 4

const REPULSION = 3000
const ATTRACTION = 0.004
const DAMPING = 0.85
const CENTER_GRAVITY = 0.01
const VELOCITY_THRESHOLD = 0.01

// Per-type colors: [default, hover, stroke]
const TYPE_COLORS = {
  note: {
    fill: { dark: 'rgba(148,163,184,0.75)', light: 'rgba(100,116,139,0.65)' },
    hover: { dark: '#60a5fa', light: '#3b82f6' },
    stroke: { dark: '#93c5fd', light: '#2563eb' },
  },
  pdf: {
    fill: { dark: 'rgba(252,165,165,0.75)', light: 'rgba(239,68,68,0.55)' },
    hover: { dark: '#f87171', light: '#dc2626' },
    stroke: { dark: '#fca5a5', light: '#b91c1c' },
  },
  canvas: {
    fill: { dark: 'rgba(196,181,253,0.75)', light: 'rgba(139,92,246,0.55)' },
    hover: { dark: '#c084fc', light: '#7c3aed' },
    stroke: { dark: '#d8b4fe', light: '#6d28d9' },
  },
  pptx: {
    fill: { dark: 'rgba(251,146,60,0.75)', light: 'rgba(249,115,22,0.55)' },
    hover: { dark: '#fb923c', light: '#ea580c' },
    stroke: { dark: '#fdba74', light: '#c2410c' },
  },
  docx: {
    fill: { dark: 'rgba(129,140,248,0.75)', light: 'rgba(99,102,241,0.55)' },
    hover: { dark: '#818cf8', light: '#6366f1' },
    stroke: { dark: '#a5b4fc', light: '#4338ca' },
  },
  spreadsheet: {
    fill: { dark: 'rgba(74,222,128,0.75)', light: 'rgba(34,197,94,0.55)' },
    hover: { dark: '#4ade80', light: '#16a34a' },
    stroke: { dark: '#86efac', light: '#15803d' },
  },
  code: {
    fill: { dark: 'rgba(56,189,248,0.75)', light: 'rgba(14,165,233,0.55)' },
    hover: { dark: '#38bdf8', light: '#0284c7' },
    stroke: { dark: '#7dd3fc', light: '#0369a1' },
  },
  mindmap: {
    fill: { dark: 'rgba(45,212,191,0.75)', light: 'rgba(20,184,166,0.55)' },
    hover: { dark: '#2dd4bf', light: '#0d9488' },
    stroke: { dark: '#5eead4', light: '#0f766e' },
  },
  kanban: {
    fill: { dark: 'rgba(251,191,36,0.75)', light: 'rgba(245,158,11,0.55)' },
    hover: { dark: '#fbbf24', light: '#d97706' },
    stroke: { dark: '#fde68a', light: '#b45309' },
  },
} as const

function nodeRadius(n: GraphNode, maxLinks: number): number {
  if (maxLinks <= 0) return MIN_RADIUS
  const t = n.linkCount / maxLinks
  return MIN_RADIUS + t * (MAX_RADIUS - MIN_RADIUS)
}

/** Rounded-rect helper (shared by pdf, docx). */
function traceRoundedRect(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, cornerRatio = 0.3): void {
  const corner = s * cornerRatio
  const x = cx - s; const y = cy - s; const w = s * 2; const h = s * 2
  ctx.moveTo(x + corner, y)
  ctx.lineTo(x + w - corner, y)
  ctx.arcTo(x + w, y, x + w, y + corner, corner)
  ctx.lineTo(x + w, y + h - corner)
  ctx.arcTo(x + w, y + h, x + w - corner, y + h, corner)
  ctx.lineTo(x + corner, y + h)
  ctx.arcTo(x, y + h, x, y + h - corner, corner)
  ctx.lineTo(x, y + corner)
  ctx.arcTo(x, y, x + corner, y, corner)
  ctx.closePath()
}

/** Trace a node's shape path (without filling/stroking). */
function traceNodeShape(ctx: CanvasRenderingContext2D, n: GraphNode, r: number): void {
  ctx.beginPath()
  if (n.type === 'note' || n.type === 'code') {
    // Circle — plain text / code files
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
  } else if (n.type === 'pdf' || n.type === 'docx') {
    // Rounded rect — document files
    traceRoundedRect(ctx, n.x, n.y, r * 1.4)
  } else if (n.type === 'spreadsheet') {
    // Sharp rect — tabular files
    const s = r * 1.4
    ctx.rect(n.x - s, n.y - s, s * 2, s * 2)
  } else if (n.type === 'pptx') {
    // Pentagon — presentations
    const d = r * 1.4
    for (let i = 0; i < 5; i++) {
      const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2
      const px = n.x + d * Math.cos(angle)
      const py = n.y + d * Math.sin(angle)
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
  } else if (n.type === 'mindmap') {
    // Hexagon — mindmaps
    const d = r * 1.3
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2
      const px = n.x + d * Math.cos(angle)
      const py = n.y + d * Math.sin(angle)
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
  } else if (n.type === 'kanban') {
    // Wide rounded rect — kanban boards (landscape orientation)
    traceRoundedRect(ctx, n.x, n.y, r * 1.2, 0.25)
  } else {
    // Diamond — canvas drawings
    const d = r * 1.5
    ctx.moveTo(n.x, n.y - d)
    ctx.lineTo(n.x + d, n.y)
    ctx.lineTo(n.x, n.y + d)
    ctx.lineTo(n.x - d, n.y)
    ctx.closePath()
  }
}

/** Draw a node shape based on its type and state. */
function drawNode(
  ctx: CanvasRenderingContext2D,
  n: GraphNode,
  r: number,
  isHover: boolean,
  isSelected: boolean,
  isDimmed: boolean,
  isDark: boolean,
  zoom: number,
): void {
  const scheme = (TYPE_COLORS as unknown as Record<string, typeof TYPE_COLORS['note']>)[n.type] ?? TYPE_COLORS.note
  const theme = isDark ? 'dark' : 'light'

  let fill: string
  if (isSelected) {
    fill = scheme.hover[theme]
  } else if (isHover) {
    fill = scheme.hover[theme]
  } else {
    fill = scheme.fill[theme]
  }

  if (isDimmed) {
    ctx.globalAlpha = 0.2
  }

  traceNodeShape(ctx, n, r)
  ctx.fillStyle = fill
  ctx.fill()

  if (isSelected) {
    // Outer selection ring
    ctx.save()
    ctx.globalAlpha = isDimmed ? 0.15 : 1
    traceNodeShape(ctx, n, r + 4 / zoom)
    ctx.strokeStyle = scheme.stroke[theme]
    ctx.lineWidth = 2.5 / zoom
    ctx.stroke()
    ctx.restore()
  } else if (isHover) {
    ctx.strokeStyle = scheme.stroke[theme]
    ctx.lineWidth = 2 / zoom
    ctx.stroke()
  }

  ctx.globalAlpha = 1
}

const DBLCLICK_MS = 280

export function GraphCanvas({ nodes, edges, onClickNode }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)

  // Pre-loaded icon images, keyed by `${type}-${theme}`
  const iconImgsRef = useRef<Record<string, HTMLImageElement>>({})

  useEffect(() => {
    const entries = Object.entries(ICON_SVG)
    for (const [type, paths] of entries) {
      for (const [theme, color] of [['dark', 'rgba(255,255,255,0.88)'], ['light', 'rgba(15,23,42,0.78)']] as const) {
        const img = new Image()
        img.src = makeIconUrl(paths, color)
        iconImgsRef.current[`${type}-${theme}`] = img
      }
    }
  }, [])

  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)

  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 })
  const cameraRef = useRef(camera)
  cameraRef.current = camera

  const dragRef = useRef<{ node: GraphNode; offsetX: number; offsetY: number } | null>(null)
  const panRef = useRef<{ startX: number; startY: number; camX: number; camY: number } | null>(null)
  const hoverRef = useRef<GraphNode | null>(null)
  const selectedRef = useRef<GraphNode | null>(null)
  // Track last click time + node for double-click detection
  const lastClickRef = useRef<{ node: GraphNode; time: number } | null>(null)

  useEffect(() => {
    nodesRef.current = nodes
    edgesRef.current = edges
  }, [nodes, edges])

  const screenToWorld = useCallback(
    (sx: number, sy: number) => {
      const c = cameraRef.current
      const canvas = canvasRef.current
      if (!canvas) return { wx: 0, wy: 0 }
      const cx = canvas.width / 2
      const cy = canvas.height / 2
      return {
        wx: (sx - cx) / c.zoom - c.x,
        wy: (sy - cy) / c.zoom - c.y,
      }
    },
    [],
  )

  const findNodeAt = useCallback(
    (sx: number, sy: number): GraphNode | null => {
      const { wx, wy } = screenToWorld(sx, sy)
      const maxLinks = Math.max(1, ...nodesRef.current.map((n) => n.linkCount))
      for (let i = nodesRef.current.length - 1; i >= 0; i--) {
        const n = nodesRef.current[i]!
        const r = nodeRadius(n, maxLinks) * 1.5 // generous hit area for all shapes
        const dx = n.x - wx
        const dy = n.y - wy
        if (dx * dx + dy * dy <= r * r) return n
      }
      return null
    },
    [screenToWorld],
  )

  // Force simulation + draw loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    function resize() {
      const container = containerRef.current
      if (!container || !canvas) return
      const dpr = window.devicePixelRatio || 1
      canvas.width = container.clientWidth * dpr
      canvas.height = container.clientHeight * dpr
      canvas.style.width = `${container.clientWidth}px`
      canvas.style.height = `${container.clientHeight}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    if (containerRef.current) ro.observe(containerRef.current)

    let isSimulating = true
    let cooldown = 300

    function tick() {
      const ns = nodesRef.current
      const es = edgesRef.current
      const cam = cameraRef.current

      if (isSimulating && cooldown > 0) {
        cooldown--

        // Repulsion (all pairs)
        for (let i = 0; i < ns.length; i++) {
          for (let j = i + 1; j < ns.length; j++) {
            const a = ns[i]!
            const b = ns[j]!
            let dx = a.x - b.x
            let dy = a.y - b.y
            let dist2 = dx * dx + dy * dy
            if (dist2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; dist2 = 1 }
            const force = REPULSION / dist2
            const fx = dx / Math.sqrt(dist2) * force
            const fy = dy / Math.sqrt(dist2) * force
            a.vx += fx; a.vy += fy
            b.vx -= fx; b.vy -= fy
          }
        }

        // Attraction (edges)
        const nodeIdx = new Map<string, GraphNode>()
        for (const n of ns) nodeIdx.set(n.id, n)

        for (const e of es) {
          const a = nodeIdx.get(e.source)
          const b = nodeIdx.get(e.target)
          if (!a || !b) continue
          const dx = b.x - a.x
          const dy = b.y - a.y
          const fx = dx * ATTRACTION
          const fy = dy * ATTRACTION
          a.vx += fx; a.vy += fy
          b.vx -= fx; b.vy -= fy
        }

        // Center gravity
        for (const n of ns) {
          n.vx -= n.x * CENTER_GRAVITY
          n.vy -= n.y * CENTER_GRAVITY
        }

        // Apply velocity
        let totalV = 0
        for (const n of ns) {
          if (dragRef.current?.node === n) { n.vx = 0; n.vy = 0; continue }
          n.vx *= DAMPING
          n.vy *= DAMPING
          n.x += n.vx
          n.y += n.vy
          totalV += Math.abs(n.vx) + Math.abs(n.vy)
        }

        if (totalV / Math.max(1, ns.length) < VELOCITY_THRESHOLD) {
          isSimulating = false
        }
      }

      // Draw
      if (!canvas) return
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      ctx.clearRect(0, 0, w, h)
      ctx.save()
      ctx.translate(w / 2, h / 2)
      ctx.scale(cam.zoom, cam.zoom)
      ctx.translate(cam.x, cam.y)

      const maxLinks = Math.max(1, ...ns.map((n) => n.linkCount))
      const nodeIdx = new Map<string, GraphNode>()
      for (const n of ns) nodeIdx.set(n.id, n)
      const isDark = document.documentElement.classList.contains('dark')

      // Build selection neighbourhood (selected node + directly connected nodes/edges)
      const sel = selectedRef.current
      const hasSelection = sel !== null
      const connectedNodeIds = new Set<string>()
      const connectedEdgeKeys = new Set<string>()
      if (sel) {
        connectedNodeIds.add(sel.id)
        for (const e of es) {
          if (e.source === sel.id || e.target === sel.id) {
            connectedNodeIds.add(e.source)
            connectedNodeIds.add(e.target)
            connectedEdgeKeys.add(`${e.source}→${e.target}`)
          }
        }
      }

      // Edges
      for (const e of es) {
        const a = nodeIdx.get(e.source)
        const b = nodeIdx.get(e.target)
        if (!a || !b) continue
        const isConnected = connectedEdgeKeys.has(`${e.source}→${e.target}`)
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        if (hasSelection) {
          if (isConnected) {
            ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)'
            ctx.lineWidth = 1.5 / cam.zoom
          } else {
            ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'
            ctx.lineWidth = 1 / cam.zoom
          }
        } else {
          ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'
          ctx.lineWidth = 1 / cam.zoom
        }
        ctx.stroke()
      }

      // Nodes
      const iconTheme = isDark ? 'dark' : 'light'
      for (const n of ns) {
        const r = nodeRadius(n, maxLinks)
        const isHover = hoverRef.current === n
        const isSelected = sel === n
        const isDimmed = hasSelection && !connectedNodeIds.has(n.id)
        ctx.save()
        drawNode(ctx, n, r, isHover, isSelected, isDimmed, isDark, cam.zoom)
        ctx.restore()

        // Draw Lucide icon centered on node
        {
          const iconImg = iconImgsRef.current[`${n.type}-${iconTheme}`]
          if (iconImg?.complete && iconImg.naturalWidth > 0) {
            const iconSize = Math.max(8, r * 1.5)
            ctx.save()
            ctx.globalAlpha = isDimmed ? 0.15 : 0.82
            ctx.drawImage(iconImg, n.x - iconSize / 2, n.y - iconSize / 2, iconSize, iconSize)
            ctx.restore()
          }
        }
      }

      // Labels
      const fontSize = Math.max(9, 11 / cam.zoom)
      ctx.font = `${fontSize}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      for (const n of ns) {
        const r = nodeRadius(n, maxLinks) * 1.5
        const isHover = hoverRef.current === n
        const isSelected = sel === n
        const isDimmed = hasSelection && !connectedNodeIds.has(n.id)
        ctx.globalAlpha = isDimmed ? 0.2 : 1
        ctx.fillStyle = isSelected || isHover
          ? (isDark ? '#f1f5f9' : '#1e293b')
          : (isDark ? 'rgba(203,213,225,0.8)' : 'rgba(51,65,85,0.75)')
        ctx.fillText(n.label, n.x, n.y + r + LABEL_OFFSET)
        ctx.globalAlpha = 1
      }

      ctx.restore()
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
    }
  }, [])

  // Mouse interactions
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    function onMouseDown(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const node = findNodeAt(sx, sy)
      if (node) {
        const { wx, wy } = screenToWorld(sx, sy)
        dragRef.current = { node, offsetX: node.x - wx, offsetY: node.y - wy }
      } else {
        panRef.current = { startX: e.clientX, startY: e.clientY, camX: cameraRef.current.x, camY: cameraRef.current.y }
      }
    }

    function onMouseMove(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top

      if (dragRef.current) {
        const { wx, wy } = screenToWorld(sx, sy)
        dragRef.current.node.x = wx + dragRef.current.offsetX
        dragRef.current.node.y = wy + dragRef.current.offsetY
        dragRef.current.node.vx = 0
        dragRef.current.node.vy = 0
        return
      }

      if (panRef.current) {
        const dx = (e.clientX - panRef.current.startX) / cameraRef.current.zoom
        const dy = (e.clientY - panRef.current.startY) / cameraRef.current.zoom
        setCamera((c) => ({ ...c, x: panRef.current!.camX + dx, y: panRef.current!.camY + dy }))
        return
      }

      hoverRef.current = findNodeAt(sx, sy)
      canvas!.style.cursor = hoverRef.current ? 'pointer' : 'grab'
    }

    function onMouseUp(e: MouseEvent) {
      const wasDragging = dragRef.current
      if (wasDragging) {
        const rect = canvas!.getBoundingClientRect()
        const sx = e.clientX - rect.left
        const sy = e.clientY - rect.top
        const node = findNodeAt(sx, sy)

        if (node && node === wasDragging.node) {
          const now = Date.now()
          const last = lastClickRef.current

          if (last && last.node === node && now - last.time < DBLCLICK_MS) {
            // Double-click → open the file
            lastClickRef.current = null
            onClickNode?.(node.id)
          } else {
            // Single click → select (or deselect if already selected)
            lastClickRef.current = { node, time: now }
            selectedRef.current = selectedRef.current === node ? null : node
          }
        } else if (!node) {
          // Clicked empty canvas → clear selection
          selectedRef.current = null
          lastClickRef.current = null
        }
      } else if (panRef.current) {
        // Finished panning (not a node click)
        const dx = Math.abs(e.clientX - panRef.current.startX)
        const dy = Math.abs(e.clientY - panRef.current.startY)
        if (dx < 4 && dy < 4) {
          // Stationary click on empty canvas → clear selection
          selectedRef.current = null
        }
      }
      dragRef.current = null
      panRef.current = null
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      setCamera((c) => ({ ...c, zoom: Math.max(0.1, Math.min(5, c.zoom * factor)) }))
    }

    canvas.addEventListener('mousedown', onMouseDown)
    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('mouseup', onMouseUp)
    canvas.addEventListener('mouseleave', () => { dragRef.current = null; panRef.current = null; hoverRef.current = null })
    canvas.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mouseup', onMouseUp)
      canvas.removeEventListener('mouseleave', () => {})
      canvas.removeEventListener('wheel', onWheel)
    }
  }, [findNodeAt, screenToWorld, onClickNode])

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-label="Vault knowledge graph"
        role="application"
      />
    </div>
  )
}
