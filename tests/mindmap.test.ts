import { describe, it, expect } from 'vitest'
import type { MindmapNode, MindmapEdge } from '@/types/mindmap'
import {
  createEmptyMindmap,
  parseMindmap,
  serializeMindmap,
  autoLayoutMindmap,
  addChildNode,
  addSiblingNode,
  deleteNode,
  wouldCreateCycle,
  extractMindmapText,
} from '@/lib/mindmap'

function node(id: string, label: string, overrides: Partial<MindmapNode> = {}): MindmapNode {
  return { id, data: { label }, position: { x: 0, y: 0 }, ...overrides }
}

function edge(source: string, target: string): MindmapEdge {
  return { id: `${source}->${target}`, source, target }
}

describe('createEmptyMindmap / parseMindmap / serializeMindmap', () => {
  it('creates a single root node round-trippable through parse/serialize', () => {
    const raw = createEmptyMindmap()
    const file = parseMindmap(raw)
    expect(file.nodes).toHaveLength(1)
    expect(file.nodes[0]!.data.label).toBe('Central Idea')
    expect(file.edges).toEqual([])

    const reparsed = parseMindmap(serializeMindmap(file))
    expect(reparsed.nodes).toEqual(file.nodes)
  })

  it('defaults missing nodes/edges to empty arrays', () => {
    const file = parseMindmap('{}')
    expect(file.nodes).toEqual([])
    expect(file.edges).toEqual([])
  })
})

describe('autoLayoutMindmap', () => {
  it('positions nodes without crashing on a cyclic graph', () => {
    // root -> a -> b -> a (cycle back to a)
    const nodes = [node('root', 'Root'), node('a', 'A'), node('b', 'B')]
    const edges = [edge('root', 'a'), edge('a', 'b'), edge('b', 'a')]

    const result = autoLayoutMindmap(nodes, edges)

    expect(result).toHaveLength(3)
    expect(result.map((n) => n.id).sort()).toEqual(['a', 'b', 'root'])
  })

  it('positions nodes without crashing on a self-loop', () => {
    const nodes = [node('root', 'Root'), node('a', 'A')]
    const edges = [edge('root', 'a'), edge('a', 'a')]

    const result = autoLayoutMindmap(nodes, edges)
    expect(result).toHaveLength(2)
  })

  it('leaves manually-positioned nodes untouched', () => {
    const nodes = [
      node('root', 'Root'),
      node('a', 'A', { manualPosition: true, position: { x: 999, y: 999 } }),
    ]
    const edges = [edge('root', 'a')]

    const result = autoLayoutMindmap(nodes, edges)
    const a = result.find((n) => n.id === 'a')!
    expect(a.position).toEqual({ x: 999, y: 999 })
  })
})

describe('wouldCreateCycle', () => {
  it('rejects a self-loop', () => {
    expect(wouldCreateCycle([], 'a', 'a')).toBe(true)
  })

  it('rejects connecting a node back to an ancestor', () => {
    const edges = [edge('root', 'a'), edge('a', 'b')]
    // b -> root would close the loop root -> a -> b -> root
    expect(wouldCreateCycle(edges, 'b', 'root')).toBe(true)
  })

  it('allows connecting to an unrelated node', () => {
    const edges = [edge('root', 'a'), edge('root', 'b')]
    expect(wouldCreateCycle(edges, 'a', 'b')).toBe(false)
  })
})

describe('addChildNode', () => {
  it('adds a new node linked to the parent by a new edge', () => {
    const nodes = [node('root', 'Root')]
    const { nodes: newNodes, edges: newEdges, newNodeId } = addChildNode(nodes, [], 'root')

    expect(newNodes).toHaveLength(2)
    expect(newEdges).toHaveLength(1)
    expect(newEdges[0]).toMatchObject({ source: 'root', target: newNodeId })
    expect(newNodes.some((n) => n.id === newNodeId)).toBe(true)
  })
})

describe('addSiblingNode', () => {
  it('adds a sibling under the same parent when one exists', () => {
    const { nodes, edges, newNodeId: childId } = addChildNode([node('root', 'Root')], [], 'root')
    const result = addSiblingNode(nodes, edges, childId)

    expect(result.nodes).toHaveLength(3)
    expect(result.edges).toHaveLength(2)
    expect(result.edges.some((e) => e.source === 'root' && e.target === result.newNodeId)).toBe(true)
  })

  it('adds another root-level node when the sibling has no parent', () => {
    const nodes = [node('root', 'Root')]
    const result = addSiblingNode(nodes, [], 'root')

    expect(result.nodes).toHaveLength(2)
    expect(result.edges).toHaveLength(0)
  })
})

describe('deleteNode', () => {
  it('removes a node and all its descendants', () => {
    const nodes = [node('root', 'Root'), node('a', 'A'), node('b', 'B'), node('c', 'C')]
    const edges = [edge('root', 'a'), edge('a', 'b'), edge('b', 'c')]

    const result = deleteNode(nodes, edges, 'a')

    expect(result.nodes.map((n) => n.id).sort()).toEqual(['root'])
    expect(result.edges).toEqual([])
  })

  it('leaves unrelated branches intact', () => {
    const nodes = [node('root', 'Root'), node('a', 'A'), node('b', 'B')]
    const edges = [edge('root', 'a'), edge('root', 'b')]

    const result = deleteNode(nodes, edges, 'a')

    expect(result.nodes.map((n) => n.id).sort()).toEqual(['b', 'root'])
    expect(result.edges).toEqual([edge('root', 'b')])
  })
})

describe('extractMindmapText', () => {
  it('joins non-empty node labels with newlines', () => {
    const file = {
      version: 1 as const,
      nodes: [node('a', 'First'), node('b', ''), node('c', 'Second')],
      edges: [],
    }
    expect(extractMindmapText(file)).toBe('First\nSecond')
  })
})
