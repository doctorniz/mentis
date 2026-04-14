export interface CanvasFile {
  version: number
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  frames: CanvasFrame[]
}

export type CanvasNode = CanvasTextNode | CanvasImageNode | CanvasStickyNode | CanvasDrawingNode | CanvasWikiLinkNode

/** Fabric `stylesToArray` format — persisted with text / sticky body for mixed formatting. */
export type CanvasInlineStyleRange = { start: number; end: number; style: Record<string, unknown> }

interface CanvasNodeBase {
  id: string
  x: number
  y: number
  width: number
  height: number
  color?: string
}

export interface CanvasTextNode extends CanvasNodeBase {
  type: 'text'
  text: string
  /** Text fill (maps to Fabric `fill`) */
  color?: string
  fontSize?: number
  fontFamily?: string
  fontWeight?: string | number
  fontStyle?: string
  underline?: boolean
  /** Per-range inline styles (Fabric); omitted when uniform default-only. */
  styles?: CanvasInlineStyleRange[]
}

export interface CanvasImageNode extends CanvasNodeBase {
  type: 'image'
  src: string
}

export interface CanvasStickyNode extends CanvasNodeBase {
  type: 'sticky'
  text: string
  color: string
  /** Inline styles for sticky body text (same shape as `CanvasTextNode.styles`). */
  textStyles?: CanvasInlineStyleRange[]
}

export interface CanvasDrawingNode extends CanvasNodeBase {
  type: 'drawing'
  paths: CanvasPath[]
}

export interface CanvasPath {
  points: { x: number; y: number; pressure?: number }[]
  strokeColor: string
  strokeWidth: number
}

export interface CanvasWikiLinkNode extends CanvasNodeBase {
  type: 'wiki-link'
  target: string
  alias?: string
}

export interface CanvasEdge {
  id: string
  fromNode: string
  toNode: string
  fromSide?: 'top' | 'right' | 'bottom' | 'left'
  toSide?: 'top' | 'right' | 'bottom' | 'left'
  color?: string
  label?: string
}

export interface CanvasFrame {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
  color?: string
}

export interface CanvasViewport {
  x: number
  y: number
  zoom: number
}
