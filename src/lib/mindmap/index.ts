import type { MindmapFile, MindmapNode, MindmapEdge } from '@/types/mindmap'
import { MINDMAP_VERSION } from '@/types/mindmap'

// ─── Serialization ────────────────────────────────────────────────────────────

export function parseMindmap(raw: string): MindmapFile {
  const parsed = JSON.parse(raw) as Partial<MindmapFile>
  return {
    version: MINDMAP_VERSION,
    nodes: parsed.nodes ?? [],
    edges: parsed.edges ?? [],
    viewport: parsed.viewport,
  }
}

export function serializeMindmap(file: MindmapFile): string {
  return JSON.stringify(file, null, 2)
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

  function buildSubtree(id: string): TreeNode {
    const children = (childrenMap.get(id) ?? [])
      .filter((cid) => nodeIds.has(cid))
      .map(buildSubtree)
    return { id, children }
  }

  return roots.map(buildSubtree)
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
  return file.nodes.map((n) => n.data.label).filter(Boolean).join('\n')
}
