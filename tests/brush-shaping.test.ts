import { describe, expect, it } from 'vitest'
import {
  pressureGamma,
  shapePressure,
  smoothPressure,
  taperLength,
  taperScale,
} from '@/lib/canvas/brush-shaping'
import { interpolateStroke } from '@/lib/canvas/math'
import type { StrokePoint } from '@/types/canvas'

describe('pressure curve', () => {
  it('is linear at the middle, firmer below it and softer above it', () => {
    expect(pressureGamma(0.5)).toBe(1)
    expect(shapePressure(0.5, 0.5)).toBeCloseTo(0.5)
    expect(shapePressure(0.5, 0)).toBeLessThan(0.5)
    expect(shapePressure(0.5, 1)).toBeGreaterThan(0.5)
  })

  it('keeps zero and full pressure where they are, and clamps stray values', () => {
    for (const curve of [0, 0.3, 0.6, 1]) {
      expect(shapePressure(0, curve)).toBe(0)
      expect(shapePressure(1, curve)).toBe(1)
    }
    expect(shapePressure(1.4)).toBe(1)
    expect(shapePressure(-1)).toBe(0)
  })

  it('smooths a jump in pressure over samples', () => {
    const first = smoothPressure(0.2, 1)
    expect(first).toBeGreaterThan(0.2)
    expect(first).toBeLessThan(1)
    expect(smoothPressure(first, 1)).toBeGreaterThan(first)
  })
})

describe('taper', () => {
  it('is off at zero and scales with brush size', () => {
    expect(taperLength(20, 0)).toBe(0)
    expect(taperScale(0, 0)).toBe(1)
    expect(taperLength(40, 0.3)).toBe(taperLength(20, 0.3) * 2)
  })

  it('starts thin and reaches full size, with the end unknown', () => {
    const length = 40
    expect(taperScale(0, length)).toBeLessThan(0.2)
    expect(taperScale(10, length)).toBeGreaterThan(taperScale(0, length))
    expect(taperScale(length, length)).toBe(1)
    expect(taperScale(500, length)).toBe(1)
  })

  it('thins at both ends once the stroke has ended', () => {
    const length = 40
    const total = 200
    expect(taperScale(0, length, total)).toBeLessThan(0.2)
    expect(taperScale(100, length, total)).toBe(1)
    expect(taperScale(total, length, total)).toBeLessThan(0.2)
    expect(taperScale(total - 10, length, total)).toBeGreaterThan(taperScale(total, length, total))
  })

  it('tapers a short stroke over half of itself, so its middle is the widest', () => {
    const length = 40
    const total = 30
    expect(taperScale(total / 2, length, total)).toBe(1)
    expect(taperScale(total / 4, length, total)).toBeLessThan(1)
  })

  it('leaves a dot or a tick full size', () => {
    expect(taperScale(0, 40, 0)).toBe(1)
    expect(taperScale(1, 40, 2)).toBe(1)
  })
})

describe('interpolateStroke along and spacing', () => {
  const pt = (x: number, along: number): StrokePoint => ({
    x,
    y: 0,
    pressure: 1,
    tiltX: 0,
    tiltY: 0,
    timestamp: 0,
    along,
  })

  // Samples a few pixels apart, as a pen reports them.
  const line = Array.from({ length: 21 }, (_, i) => pt(i * 5, i * 5))

  it('reports how far along the stroke each stamp is', () => {
    const stamps = interpolateStroke(line, 10)
    expect(stamps.length).toBeGreaterThan(5)
    for (const s of stamps) expect(Math.abs((s.along ?? -99) - s.x)).toBeLessThan(1.5)
  })

  it('packs stamps closer where the spacing asks for it', () => {
    const even = interpolateStroke(line, 10)
    const denseAtStart = interpolateStroke(line, (along) => (along < 30 ? 3 : 10))
    expect(denseAtStart.length).toBeGreaterThan(even.length)
    const early = denseAtStart.filter((s) => s.x < 30).length
    expect(early).toBeGreaterThan(even.filter((s) => s.x < 30).length * 2)
  })
})
