import { fileTypeIdOf, titleForPath } from '@/core/registries'

/** File-type registry id of the node's file (see `@/core/registries`). */
export type GraphNodeType = string

export interface GraphNode {
  id: string
  label: string
  type: GraphNodeType
  /** Folder prefix, e.g. "daily" or "" for root notes */
  folder: string
  linkCount: number
  x: number
  y: number
  vx: number
  vy: number
}

export interface GraphEdge {
  source: string
  target: string
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

function titleFromPath(p: string): string {
  return titleForPath(p)
}

function folderFromPath(p: string): string {
  const parts = p.split('/')
  return parts.length > 1 ? parts.slice(0, -1).join('/') : ''
}

function typeFromPath(p: string): GraphNodeType {
  return fileTypeIdOf(p)
}

/**
 * Build the graph of note connections. Every path becomes a node; `edges` are
 * already-resolved links between them, and each one adds to both ends'
 * `linkCount`. Edges that name a path with no node are ignored.
 */
export function buildNoteGraph(
  allPaths: readonly string[],
  edges: readonly GraphEdge[],
): GraphData {
  const nodeMap = new Map<string, GraphNode>()
  for (const p of allPaths) {
    nodeMap.set(p, {
      id: p,
      label: titleFromPath(p),
      type: typeFromPath(p),
      folder: folderFromPath(p),
      linkCount: 0,
      x: Math.random() * 600 - 300,
      y: Math.random() * 600 - 300,
      vx: 0,
      vy: 0,
    })
  }

  const kept: GraphEdge[] = []
  for (const e of edges) {
    const from = nodeMap.get(e.source)
    const to = nodeMap.get(e.target)
    if (!from || !to) continue
    kept.push({ source: e.source, target: e.target })
    from.linkCount++
    to.linkCount++
  }

  return { nodes: Array.from(nodeMap.values()), edges: kept }
}

/**
 * Filter graph data to only include nodes in a specific folder (and their edges).
 */
export function filterGraphByFolder(data: GraphData, folder: string): GraphData {
  const filtered = new Set<string>()
  for (const n of data.nodes) {
    if (folder === '' || n.folder === folder || n.folder.startsWith(folder + '/')) {
      filtered.add(n.id)
    }
  }
  return {
    nodes: data.nodes.filter((n) => filtered.has(n.id)),
    edges: data.edges.filter((e) => filtered.has(e.source) && filtered.has(e.target)),
  }
}

/**
 * Return the set of unique folder prefixes present in the graph.
 */
export function graphFolders(data: GraphData): string[] {
  const folders = new Set<string>()
  for (const n of data.nodes) {
    if (n.folder) folders.add(n.folder)
  }
  return ['', ...Array.from(folders).sort()]
}
