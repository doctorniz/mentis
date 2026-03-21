export interface CanvasFile {
  version: number
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

export type CanvasNode = CanvasTextNode | CanvasImageNode | CanvasStickyNode | CanvasDrawingNode

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
}

export interface CanvasImageNode extends CanvasNodeBase {
  type: 'image'
  src: string
}

export interface CanvasStickyNode extends CanvasNodeBase {
  type: 'sticky'
  text: string
  color: string
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
