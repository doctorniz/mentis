import type { CanvasFile, CanvasNode, CanvasEdge } from '@/types/canvas'

const CANVAS_VERSION = 1

export function createEmptyCanvas(): CanvasFile {
  return {
    version: CANVAS_VERSION,
    nodes: [],
    edges: [],
    frames: [],
  }
}

export function serializeCanvas(canvas: CanvasFile): string {
  return JSON.stringify(canvas, null, 2)
}

export function deserializeCanvas(json: string): CanvasFile {
  const parsed = JSON.parse(json) as CanvasFile
  return {
    version: parsed.version ?? CANVAS_VERSION,
    nodes: parsed.nodes ?? [],
    edges: parsed.edges ?? [],
    frames: parsed.frames ?? [],
  }
}

export function addNode(canvas: CanvasFile, node: CanvasNode): CanvasFile {
  return {
    ...canvas,
    nodes: [...canvas.nodes, node],
  }
}

export function removeNode(canvas: CanvasFile, nodeId: string): CanvasFile {
  return {
    ...canvas,
    nodes: canvas.nodes.filter((n) => n.id !== nodeId),
    edges: canvas.edges.filter((e) => e.fromNode !== nodeId && e.toNode !== nodeId),
  }
}

export function addEdge(canvas: CanvasFile, edge: CanvasEdge): CanvasFile {
  return {
    ...canvas,
    edges: [...canvas.edges, edge],
  }
}

export function removeEdge(canvas: CanvasFile, edgeId: string): CanvasFile {
  return {
    ...canvas,
    edges: canvas.edges.filter((e) => e.id !== edgeId),
  }
}

export function generateNodeId(): string {
  return crypto.randomUUID()
}
