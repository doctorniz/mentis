export interface MindmapNodeData {
  label: string
  color?: string
  /** True when this node is in inline-edit mode */
  editing?: boolean
}

export interface MindmapNode {
  id: string
  data: MindmapNodeData
  position: { x: number; y: number }
  /** undefined for root */
  parentId?: string
  /** User has manually positioned this node; skip auto-layout */
  manualPosition?: boolean
}

export interface MindmapEdge {
  id: string
  source: string
  target: string
}

export interface MindmapFile {
  version: 1
  nodes: MindmapNode[]
  edges: MindmapEdge[]
  viewport?: { x: number; y: number; zoom: number }
}

export const MINDMAP_VERSION = 1 as const

export const MINDMAP_NODE_COLORS = [
  'teal',
  'violet',
  'amber',
  'rose',
  'sky',
  'emerald',
] as const

export type MindmapNodeColor = (typeof MINDMAP_NODE_COLORS)[number]
