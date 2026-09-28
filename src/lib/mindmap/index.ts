import matter from 'gray-matter'
import type { MindmapFile, MindmapNode, MindmapEdge } from '@/types/mindmap'
import { MINDMAP_VERSION } from '@/types/mindmap'

// ─── Serialization (.map.md) ──────────────────────────────────────────────────
//
// A mindmap is stored as a readable nested markdown list:
//
//   ---
//   mindmap:
//     viewport: { x: 400, y: 300, zoom: 1 }
//     nodes:                 # only nodes with something to remember
//       b7f2c1: { x: 320, y: 40, color: violet }
//     links:                 # parents beyond the list nesting (a map is a DAG)
//       - [b7f2c1, c2d9e0]
//   ---
//   - Central Idea
//     - Child A <!--b7f2c1-->
//       - Grandchild
//     - Child B <!--c2d9e0-->
//   - A floating idea
//
// Nesting gives each node its primary parent; top-level items are roots (a
// floating node is just another root). The `<!--id-->` marker is written only
// for nodes the front matter refers to, so a hand-written list with no ids is a
// valid map. Positions are stored only for nodes the user placed by hand;
// everything else is auto-laid out on load.

interface MindmapMeta {
  viewport?: { x: number; y: number; zoom: number }
  nodes?: Record<string, { x?: number; y?: number; color?: string }>
  links?: [string, string][]
}

const LIST_ITEM = /^(\s*)[-*+]\s+(.*)$/
const ID_MARKER = /\s*<!--\s*([A-Za-z0-9_-]+)\s*-->\s*$/
const SHORT_ID = /^[A-Za-z0-9_-]{1,12}$/

export function parseMindmap(raw: string): MindmapFile {
  const { data, content } = matter(raw)
  const meta = ((data as { mindmap?: MindmapMeta }).mindmap ?? {}) as MindmapMeta
  const metaNodes = meta.nodes ?? {}

  const nodes: MindmapNode[] = []
  const edges: MindmapEdge[] = []
  const seen = new Set<string>()
  const stack: { indent: number; id: string }[] = []

  for (const line of content.split(/\r?\n/)) {
    const item = LIST_ITEM.exec(line)
    if (!item) continue
    const indent = item[1].replace(/\t/g, '  ').length
    let label = item[2]
    const marker = ID_MARKER.exec(label)
    if (marker) label = label.slice(0, marker.index)
    let id = marker?.[1]
    if (!id || seen.has(id)) id = crypto.randomUUID()
    seen.add(id)

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop()
    const parentId = stack.length > 0 ? stack[stack.length - 1].id : undefined

    const m = marker ? metaNodes[marker[1]] : undefined
    const placed = typeof m?.x === 'number' && typeof m?.y === 'number'
    nodes.push({
      id,
      data: { label: label.trim(), ...(m?.color ? { color: m.color } : {}) },
      position: placed ? { x: m!.x!, y: m!.y! } : { x: 0, y: 0 },
      ...(parentId ? { parentId } : {}),
      ...(placed ? { manualPosition: true } : {}),
    })
    if (parentId) edges.push({ id: `e-${parentId}-${id}`, source: parentId, target: id })
    stack.push({ indent, id })
  }

  const ids = new Set(nodes.map((n) => n.id))
  for (const link of meta.links ?? []) {
    if (!Array.isArray(link) || link.length !== 2) continue
    const [source, target] = link.map(String)
    if (!ids.has(source) || !ids.has(target) || source === target) continue
    if (edges.some((e) => e.source === source && e.target === target)) continue
    edges.push({ id: `e-${source}-${target}`, source, target })
  }

  return {
    version: MINDMAP_VERSION,
    nodes: autoLayoutMindmap(nodes, edges),
    edges,
    viewport: meta.viewport,
  }
}

/** Short, stable id for the file: kept as-is if already short, else 6+ chars of it. */
function shortIds(ids: string[]): Map<string, string> {
  const out = new Map<string, string>()
  const taken = new Set<string>()
  for (const id of ids) {
    if (SHORT_ID.test(id) && !taken.has(id)) {
      out.set(id, id)
      taken.add(id)
    }
  }
  for (const id of ids) {
    if (out.has(id)) continue
    const alnum = id.replace(/[^A-Za-z0-9]/g, '') || 'n'
    let len = 6
    let candidate = alnum.slice(0, len)
    while (taken.has(candidate)) {
      len += 1
      candidate = len <= alnum.length ? alnum.slice(0, len) : `${alnum}${len}`
    }
    out.set(id, candidate)
    taken.add(candidate)
  }
  return out
}

export function serializeMindmap(file: MindmapFile): string {
  const byId = new Map(file.nodes.map((n) => [n.id, n]))

  // Primary parent = the first edge (in edge order) into a node that keeps the
  // nesting acyclic. Every other valid edge becomes an extra link.
  const primaryParent = new Map<string, string>()
  const children = new Map<string, string[]>()
  const nested = new Set<MindmapEdge>()
  for (const e of file.edges) {
    if (!byId.has(e.source) || !byId.has(e.target) || e.source === e.target) continue
    if (primaryParent.has(e.target)) continue
    let cur: string | undefined = e.source
    let cycle = false
    while (cur !== undefined) {
      if (cur === e.target) {
        cycle = true
        break
      }
      cur = primaryParent.get(cur)
    }
    if (cycle) continue
    primaryParent.set(e.target, e.source)
    const list = children.get(e.source) ?? []
    list.push(e.target)
    children.set(e.source, list)
    nested.add(e)
  }
  const linkPairs: [string, string][] = []
  for (const e of file.edges) {
    if (nested.has(e) || !byId.has(e.source) || !byId.has(e.target) || e.source === e.target) {
      continue
    }
    if (linkPairs.some(([s, t]) => s === e.source && t === e.target)) continue
    linkPairs.push([e.source, e.target])
  }

  // Only nodes the front matter refers to carry an id in the list.
  const referenced = new Set<string>()
  for (const n of file.nodes) if (n.manualPosition || n.data.color) referenced.add(n.id)
  for (const [s, t] of linkPairs) {
    referenced.add(s)
    referenced.add(t)
  }
  const idFor = shortIds([...referenced])

  const lines: string[] = []
  const emitted = new Set<string>()
  const emit = (id: string, depth: number) => {
    if (emitted.has(id)) return
    emitted.add(id)
    const node = byId.get(id)!
    const label = node.data.label.replace(/\r?\n/g, ' ')
    const marker = idFor.has(id) ? ` <!--${idFor.get(id)}-->` : ''
    lines.push(`${'  '.repeat(depth)}- ${label}${marker}`)
    for (const child of children.get(id) ?? []) emit(child, depth + 1)
  }
  for (const n of file.nodes) if (!primaryParent.has(n.id)) emit(n.id, 0)

  const meta: MindmapMeta = {}
  if (file.viewport) {
    meta.viewport = {
      x: Math.round(file.viewport.x),
      y: Math.round(file.viewport.y),
      zoom: Math.round(file.viewport.zoom * 1000) / 1000,
    }
  }
  const metaNodes: NonNullable<MindmapMeta['nodes']> = {}
  for (const n of file.nodes) {
    if (!idFor.has(n.id)) continue
    const entry: { x?: number; y?: number; color?: string } = {}
    if (n.manualPosition) {
      entry.x = Math.round(n.position.x)
      entry.y = Math.round(n.position.y)
    }
    if (n.data.color) entry.color = n.data.color
    if (Object.keys(entry).length > 0) metaNodes[idFor.get(n.id)!] = entry
  }
  if (Object.keys(metaNodes).length > 0) meta.nodes = metaNodes
  if (linkPairs.length > 0) {
    meta.links = linkPairs.map(([s, t]) => [idFor.get(s)!, idFor.get(t)!])
  }

  const body = lines.join('\n') + '\n'
  return Object.keys(meta).length > 0 ? matter.stringify(body, { mindmap: meta }) : body
}

// ─── Create empty ─────────────────────────────────────────────────────────────

export function createEmptyMindmap(): string {
  const rootId = crypto.randomUUID()
  const file: MindmapFile = {
    version: MINDMAP_VERSION,
    nodes: [
      {
        id: rootId,
        data: { label: 'Central Idea' },
        position: { x: 0, y: 0 },
      },
    ],
    edges: [],
    viewport: { x: 400, y: 300, zoom: 1 },
  }
  return serializeMindmap(file)
}

// ─── Tree layout ──────────────────────────────────────────────────────────────

const H_GAP = 220
const V_GAP = 80

interface TreeNode {
  id: string
  children: TreeNode[]
}

function buildTree(nodes: MindmapNode[], edges: MindmapEdge[]): TreeNode[] {
  const childrenMap = new Map<string, string[]>()
  const hasParent = new Set<string>()

  for (const e of edges) {
    if (!childrenMap.has(e.source)) childrenMap.set(e.source, [])
    childrenMap.get(e.source)!.push(e.target)
    hasParent.add(e.target)
  }

  const nodeIds = new Set(nodes.map((n) => n.id))
  const roots = nodes.filter((n) => !hasParent.has(n.id)).map((n) => n.id)

  // User-created edges can form a cycle (e.g. connecting a node back to an
  // ancestor). Track the ancestor chain and drop any child that's already in
  // it — including the node itself (self-loop) — so layout can't recurse
  // forever on a cyclic graph.
  function buildSubtree(id: string, ancestors: Set<string>): TreeNode {
    const nextAncestors = new Set(ancestors)
    nextAncestors.add(id)
    const children = (childrenMap.get(id) ?? [])
      .filter((cid) => nodeIds.has(cid) && !nextAncestors.has(cid))
      .map((cid) => buildSubtree(cid, nextAncestors))
    return { id, children }
  }

  return roots.map((id) => buildSubtree(id, new Set()))
}

function subtreeHeight(tree: TreeNode): number {
  if (tree.children.length === 0) return 1
  return tree.children.reduce((sum, c) => sum + subtreeHeight(c), 0)
}

function assignPositions(
  tree: TreeNode,
  depth: number,
  startY: number,
  positions: Map<string, { x: number; y: number }>,
): void {
  const height = subtreeHeight(tree)
  const centerY = startY + (height * V_GAP) / 2 - V_GAP / 2
  positions.set(tree.id, { x: depth * H_GAP, y: centerY })

  let childY = startY
  for (const child of tree.children) {
    assignPositions(child, depth + 1, childY, positions)
    childY += subtreeHeight(child) * V_GAP
  }
}

/**
 * Compute auto-layout positions for nodes that don't have a manualPosition.
 * Returns a new nodes array with updated positions.
 */
export function autoLayoutMindmap(nodes: MindmapNode[], edges: MindmapEdge[]): MindmapNode[] {
  const manual = new Set(nodes.filter((n) => n.manualPosition).map((n) => n.id))
  if (manual.size === nodes.length) return nodes

  const roots = buildTree(nodes, edges)
  const positions = new Map<string, { x: number; y: number }>()

  let startY = 0
  for (const root of roots) {
    assignPositions(root, 0, startY, positions)
    startY += subtreeHeight(root) * V_GAP + V_GAP
  }

  return nodes.map((n) => {
    if (manual.has(n.id)) return n
    const pos = positions.get(n.id)
    if (!pos) return n
    return { ...n, position: pos }
  })
}

/**
 * Whether connecting `source -> target` would create a cycle, given the
 * edges that already exist (including a self-loop, source === target).
 * True when `target` can already reach `source` by following existing edges
 * forward — closing the loop back to where it started.
 */
export function wouldCreateCycle(edges: MindmapEdge[], source: string, target: string): boolean {
  if (source === target) return true
  const visited = new Set<string>()
  const stack = [target]
  while (stack.length > 0) {
    const cur = stack.pop()!
    if (cur === source) return true
    if (visited.has(cur)) continue
    visited.add(cur)
    for (const e of edges) {
      if (e.source === cur) stack.push(e.target)
    }
  }
  return false
}

// ─── Node helpers ─────────────────────────────────────────────────────────────

export function addChildNode(
  nodes: MindmapNode[],
  edges: MindmapEdge[],
  parentId: string,
): { nodes: MindmapNode[]; edges: MindmapEdge[]; newNodeId: string } {
  const parent = nodes.find((n) => n.id === parentId)
  const newId = crypto.randomUUID()
  const newNode: MindmapNode = {
    id: newId,
    data: { label: '' },
    parentId,
    position: { x: (parent?.position.x ?? 0) + H_GAP, y: parent?.position.y ?? 0 },
  }
  const newEdge: MindmapEdge = {
    id: crypto.randomUUID(),
    source: parentId,
    target: newId,
  }
  const updatedNodes = autoLayoutMindmap([...nodes, newNode], [...edges, newEdge])
  return {
    nodes: updatedNodes,
    edges: [...edges, newEdge],
    newNodeId: newId,
  }
}

export function addSiblingNode(
  nodes: MindmapNode[],
  edges: MindmapEdge[],
  siblingId: string,
): { nodes: MindmapNode[]; edges: MindmapEdge[]; newNodeId: string } {
  const sibling = nodes.find((n) => n.id === siblingId)
  const parentEdge = edges.find((e) => e.target === siblingId)
  if (!parentEdge) {
    // Top-level node — add another root
    const newId = crypto.randomUUID()
    const newNode: MindmapNode = {
      id: newId,
      data: { label: '' },
      position: { x: sibling?.position.x ?? 0, y: (sibling?.position.y ?? 0) + V_GAP },
    }
    const updatedNodes = autoLayoutMindmap([...nodes, newNode], edges)
    return { nodes: updatedNodes, edges, newNodeId: newId }
  }
  return addChildNode(nodes, edges, parentEdge.source)
}

export function deleteNode(
  nodes: MindmapNode[],
  edges: MindmapEdge[],
  nodeId: string,
): { nodes: MindmapNode[]; edges: MindmapEdge[] } {
  // Collect all descendants
  const toDelete = new Set<string>([nodeId])
  let changed = true
  while (changed) {
    changed = false
    for (const e of edges) {
      if (toDelete.has(e.source) && !toDelete.has(e.target)) {
        toDelete.add(e.target)
        changed = true
      }
    }
  }
  return {
    nodes: nodes.filter((n) => !toDelete.has(n.id)),
    edges: edges.filter((e) => !toDelete.has(e.source) && !toDelete.has(e.target)),
  }
}

/**
 * Extract all node labels for search indexing.
 */
export function extractMindmapText(file: MindmapFile): string {
  return file.nodes
    .map((n) => n.data.label)
    .filter(Boolean)
    .join('\n')
}
