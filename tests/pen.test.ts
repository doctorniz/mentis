import { describe, it, expect, beforeEach, vi } from 'vitest'
import { interpolateStroke, tiltShape } from '@/lib/canvas/math'
import { inkTouched } from '@/lib/pdf/ink-hit'
import type { PdfInkAnnotation } from '@/types/pdf'

describe('tiltShape', () => {
  it('is a round, full-strength tip for an upright pen, a mouse or a finger', () => {
    expect(tiltShape(0, 0)).toEqual({ stretch: 1, angle: 0, shade: 1 })
    expect(tiltShape()).toEqual({ stretch: 1, angle: 0, shade: 1 })
  })

  it('lengthens and lightens the tip as the pen leans, towards where it leans', () => {
    const half = tiltShape(30, 0)
    const full = tiltShape(60, 0)
    expect(half.stretch).toBeCloseTo(2)
    expect(full.stretch).toBeCloseTo(3)
    expect(full.shade).toBeLessThan(half.shade)
    expect(full.angle).toBeCloseTo(0)
    expect(tiltShape(0, 45).angle).toBeCloseTo(Math.PI / 2)
    // Past fully on its side it stays there.
    expect(tiltShape(90, 0).stretch).toBeCloseTo(3)
  })
})

describe('interpolateStroke', () => {
  it('carries the pen tilt along the stroke', () => {
    const stamps = interpolateStroke(
      [
        { x: 0, y: 0, pressure: 1, tiltX: 0, tiltY: 0, timestamp: 0 },
        { x: 40, y: 0, pressure: 1, tiltX: 40, tiltY: 0, timestamp: 1 },
      ],
      4,
    )
    expect(stamps.length).toBeGreaterThan(3)
    expect(stamps[0]!.tiltX).toBe(0)
    const tilts = stamps.map((s) => s.tiltX!)
    expect(tilts).toEqual([...tilts].sort((a, b) => a - b))
    expect(tilts.at(-1)!).toBeGreaterThan(20)
  })
})

describe('inkTouched', () => {
  const ink = (id: string, points: { x: number; y: number }[], strokeWidth = 2) =>
    ({ id, paths: [{ points }], strokeWidth }) as unknown as PdfInkAnnotation

  it('finds strokes passing within reach, allowing for their width', () => {
    const across = ink('across', [
      { x: 0, y: 50 },
      { x: 100, y: 50 },
    ])
    const far = ink('far', [
      { x: 0, y: 200 },
      { x: 100, y: 200 },
    ])
    const thick = ink('thick', [{ x: 50, y: 70 }, { x: 60, y: 70 }], 30)
    const hit = inkTouched([across, far, thick], { x: 50, y: 54 }, 3)
    expect(hit.map((i) => i.id).sort()).toEqual(['across', 'thick'])
    expect(inkTouched([across], { x: 120, y: 50 }, 3)).toEqual([])
  })
})

describe('pen policy', () => {
  beforeEach(() => {
    vi.resetModules()
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    })
  })

  it('automatic: fingers draw until a pen is used', async () => {
    const pen = await import('@/lib/browser/pen')
    expect(pen.getDrawWith()).toBe('auto')
    expect(pen.fingersDraw()).toBe(true)
    pen.notePointer('touch')
    expect(pen.fingersDraw()).toBe(true)
    pen.notePointer('pen')
    expect(pen.fingersDraw()).toBe(false)
  })

  it('pen only, or pen and finger, whatever has been used', async () => {
    const pen = await import('@/lib/browser/pen')
    pen.setDrawWith('pen')
    expect(pen.fingersDraw()).toBe(false)
    pen.setDrawWith('any')
    pen.notePointer('pen')
    expect(pen.fingersDraw()).toBe(true)
    pen.setDrawWith('auto')
    expect(pen.getDrawWith()).toBe('auto')
  })

  it("recognises the pen's eraser end and eraser button", async () => {
    const { isPenEraser } = await import('@/lib/browser/pen')
    expect(isPenEraser({ pointerType: 'pen', button: 5, buttons: 32 })).toBe(true)
    expect(isPenEraser({ pointerType: 'pen', button: -1, buttons: 32 })).toBe(true)
    expect(isPenEraser({ pointerType: 'pen', button: 0, buttons: 1 })).toBe(false)
    expect(isPenEraser({ pointerType: 'mouse', button: 5, buttons: 32 })).toBe(false)
  })
})
