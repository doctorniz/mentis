import { describe, it, expect, beforeEach } from 'vitest'
import { CanvasUndoStack } from '@/lib/canvas/undo-stack'
import type { CanvasFile } from '@/types/canvas'

function makeFile(nodeCount: number): CanvasFile {
  return {
    version: 1,
    nodes: Array.from({ length: nodeCount }, (_, i) => ({
      id: `n${i}`,
      type: 'text' as const,
      x: i * 10,
      y: 0,
      width: 100,
      height: 30,
      text: `Node ${i}`,
    })),
    edges: [],
    frames: [],
  }
}

describe('CanvasUndoStack', () => {
  let stack: CanvasUndoStack

  beforeEach(() => {
    stack = new CanvasUndoStack()
  })

  it('starts with canUndo=false and canRedo=false', () => {
    expect(stack.canUndo).toBe(false)
    expect(stack.canRedo).toBe(false)
  })

  it('push enables undo', () => {
    stack.push(makeFile(1))
    expect(stack.canUndo).toBe(true)
    expect(stack.canRedo).toBe(false)
  })

  it('undo returns the previous state', () => {
    const v0 = makeFile(0)
    const v1 = makeFile(1)
    stack.push(v0)
    const restored = stack.undo(v1)
    expect(restored).not.toBeNull()
    expect(restored!.nodes).toHaveLength(0)
  })

  it('undo then redo returns to the current state', () => {
    const v0 = makeFile(0)
    const v1 = makeFile(1)
    stack.push(v0)
    const restored = stack.undo(v1)!
    expect(restored.nodes).toHaveLength(0)

    expect(stack.canRedo).toBe(true)
    const redone = stack.redo(restored)!
    expect(redone.nodes).toHaveLength(1)
  })

  it('undo returns null when history is empty', () => {
    expect(stack.undo(makeFile(0))).toBeNull()
  })

  it('redo returns null when future is empty', () => {
    expect(stack.redo(makeFile(0))).toBeNull()
  })

  it('push clears the redo future', () => {
    stack.push(makeFile(0))
    stack.push(makeFile(1))
    stack.undo(makeFile(2))
    expect(stack.canRedo).toBe(true)
    stack.push(makeFile(3))
    expect(stack.canRedo).toBe(false)
  })

  it('stores deep clones — mutating original does not affect history', () => {
    const v0 = makeFile(1)
    stack.push(v0)
    v0.nodes[0]!.text = 'MUTATED'
    const restored = stack.undo(makeFile(2))!
    expect(restored.nodes[0]!.text).toBe('Node 0')
  })

  it('caps history at 50 entries', () => {
    for (let i = 0; i < 60; i++) {
      stack.push(makeFile(i))
    }
    let undoCount = 0
    let current = makeFile(60)
    while (stack.canUndo) {
      const prev = stack.undo(current)
      if (!prev) break
      current = prev
      undoCount++
    }
    expect(undoCount).toBe(50)
  })

  it('clear resets the stack', () => {
    stack.push(makeFile(1))
    stack.push(makeFile(2))
    stack.clear()
    expect(stack.canUndo).toBe(false)
    expect(stack.canRedo).toBe(false)
  })

  it('supports multiple undo steps', () => {
    stack.push(makeFile(0))
    stack.push(makeFile(1))
    stack.push(makeFile(2))

    const s2 = stack.undo(makeFile(3))!
    expect(s2.nodes).toHaveLength(2)
    const s1 = stack.undo(s2)!
    expect(s1.nodes).toHaveLength(1)
    const s0 = stack.undo(s1)!
    expect(s0.nodes).toHaveLength(0)
    expect(stack.canUndo).toBe(false)
  })
})
