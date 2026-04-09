import { describe, it, expect } from 'vitest'
import {
  createEmptyCanvas,
  serializeCanvas,
  deserializeCanvas,
  addNode,
  removeNode,
  addEdge,
  removeEdge,
} from '@/lib/canvas'
import type { CanvasTextNode, CanvasStickyNode, CanvasWikiLinkNode, CanvasEdge, CanvasFile } from '@/types/canvas'

describe('createEmptyCanvas', () => {
  it('returns valid empty canvas structure', () => {
    const canvas = createEmptyCanvas()
    expect(canvas.version).toBe(1)
    expect(canvas.nodes).toEqual([])
    expect(canvas.edges).toEqual([])
    expect(canvas.frames).toEqual([])
  })
})

describe('serializeCanvas / deserializeCanvas', () => {
  it('round-trips empty canvas', () => {
    const canvas = createEmptyCanvas()
    const json = serializeCanvas(canvas)
    const restored = deserializeCanvas(json)
    expect(restored).toEqual(canvas)
  })

  it('round-trips canvas with text node', () => {
    const canvas = createEmptyCanvas()
    const node: CanvasTextNode = {
      id: 'n1', type: 'text', x: 10, y: 20, width: 200, height: 50, text: 'Hello',
    }
    const withNode = addNode(canvas, node)
    const json = serializeCanvas(withNode)
    const restored = deserializeCanvas(json)
    expect(restored.nodes).toHaveLength(1)
    expect(restored.nodes[0]).toEqual(node)
  })

  it('round-trips canvas with sticky node', () => {
    const node: CanvasStickyNode = {
      id: 's1', type: 'sticky', x: 0, y: 0, width: 150, height: 150,
      text: 'Remember', color: '#fff3bf',
    }
    const canvas = addNode(createEmptyCanvas(), node)
    const restored = deserializeCanvas(serializeCanvas(canvas))
    expect(restored.nodes[0]).toEqual(node)
  })

  it('round-trips canvas with wiki-link node', () => {
    const node: CanvasWikiLinkNode = {
      id: 'w1', type: 'wiki-link', x: 50, y: 50, width: 180, height: 32,
      target: 'My Note', alias: 'Note',
    }
    const canvas = addNode(createEmptyCanvas(), node)
    const restored = deserializeCanvas(serializeCanvas(canvas))
    expect(restored.nodes[0]).toEqual(node)
  })

  it('round-trips canvas with edges', () => {
    const edge: CanvasEdge = {
      id: 'e1', fromNode: 'n1', toNode: 'n2', color: '#868e96',
    }
    const canvas = addEdge(createEmptyCanvas(), edge)
    const restored = deserializeCanvas(serializeCanvas(canvas))
    expect(restored.edges).toHaveLength(1)
    expect(restored.edges[0]).toEqual(edge)
  })

  it('handles malformed JSON with missing fields', () => {
    const json = JSON.stringify({ version: 2 })
    const canvas = deserializeCanvas(json)
    expect(canvas.version).toBe(2)
    expect(canvas.nodes).toEqual([])
    expect(canvas.edges).toEqual([])
    expect(canvas.frames).toEqual([])
  })

  it('produces valid JSON string', () => {
    const canvas = createEmptyCanvas()
    const json = serializeCanvas(canvas)
    expect(() => JSON.parse(json)).not.toThrow()
  })

  it('preserves frames through round-trip', () => {
    const canvas: CanvasFile = {
      version: 1,
      nodes: [],
      edges: [],
      frames: [{ id: 'f1', label: 'Section A', x: 0, y: 0, width: 400, height: 300, color: '#4c6ef5' }],
    }
    const restored = deserializeCanvas(serializeCanvas(canvas))
    expect(restored.frames).toHaveLength(1)
    expect(restored.frames[0]!.label).toBe('Section A')
  })
})

describe('addNode / removeNode', () => {
  it('adds a node immutably', () => {
    const canvas = createEmptyCanvas()
    const node: CanvasTextNode = {
      id: 'n1', type: 'text', x: 0, y: 0, width: 100, height: 50, text: 'Test',
    }
    const updated = addNode(canvas, node)
    expect(updated.nodes).toHaveLength(1)
    expect(canvas.nodes).toHaveLength(0)
  })

  it('removes a node and connected edges', () => {
    let canvas = createEmptyCanvas()
    const n1: CanvasTextNode = { id: 'n1', type: 'text', x: 0, y: 0, width: 100, height: 50, text: 'A' }
    const n2: CanvasTextNode = { id: 'n2', type: 'text', x: 200, y: 0, width: 100, height: 50, text: 'B' }
    canvas = addNode(canvas, n1)
    canvas = addNode(canvas, n2)
    canvas = addEdge(canvas, { id: 'e1', fromNode: 'n1', toNode: 'n2' })

    const removed = removeNode(canvas, 'n1')
    expect(removed.nodes).toHaveLength(1)
    expect(removed.nodes[0]!.id).toBe('n2')
    expect(removed.edges).toHaveLength(0)
  })

  it('removeNode on nonexistent id is a no-op', () => {
    const canvas = createEmptyCanvas()
    const removed = removeNode(canvas, 'ghost')
    expect(removed.nodes).toHaveLength(0)
  })
})

describe('addEdge / removeEdge', () => {
  it('adds an edge immutably', () => {
    const canvas = createEmptyCanvas()
    const edge: CanvasEdge = { id: 'e1', fromNode: 'a', toNode: 'b' }
    const updated = addEdge(canvas, edge)
    expect(updated.edges).toHaveLength(1)
    expect(canvas.edges).toHaveLength(0)
  })

  it('removes an edge by id', () => {
    let canvas = createEmptyCanvas()
    canvas = addEdge(canvas, { id: 'e1', fromNode: 'a', toNode: 'b' })
    canvas = addEdge(canvas, { id: 'e2', fromNode: 'b', toNode: 'c' })
    const removed = removeEdge(canvas, 'e1')
    expect(removed.edges).toHaveLength(1)
    expect(removed.edges[0]!.id).toBe('e2')
  })
})
