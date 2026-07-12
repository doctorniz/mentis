import { describe, it, expect } from 'vitest'
import { floodFill } from '@/lib/canvas/flood-fill'

/** Build a w×h RGBA buffer filled with one colour. */
function buffer(w: number, h: number, [r, g, b, a]: number[]): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    px[i * 4] = r
    px[i * 4 + 1] = g
    px[i * 4 + 2] = b
    px[i * 4 + 3] = a
  }
  return px
}

function pixelAt(px: Uint8ClampedArray, w: number, x: number, y: number): number[] {
  const i = (y * w + x) * 4
  return [px[i], px[i + 1], px[i + 2], px[i + 3]]
}

describe('floodFill', () => {
  it('fills a region of exactly-matching pixels', () => {
    const px = buffer(8, 8, [0, 0, 0, 0])
    const ok = floodFill(px, 8, 8, 4, 4, 255, 0, 0, 255)
    expect(ok).toBe(true)
    expect(pixelAt(px, 8, 0, 0)).toEqual([255, 0, 0, 255])
    expect(pixelAt(px, 8, 7, 7)).toEqual([255, 0, 0, 255])
  })

  it('stops at a hard boundary without tolerance', () => {
    const px = buffer(8, 8, [0, 0, 0, 0])
    // Vertical opaque wall at x=4
    for (let y = 0; y < 8; y++) {
      const i = (y * 8 + 4) * 4
      px[i] = 10
      px[i + 1] = 10
      px[i + 2] = 10
      px[i + 3] = 255
    }
    floodFill(px, 8, 8, 1, 1, 255, 0, 0, 255)
    // Left of the wall filled, right side untouched
    expect(pixelAt(px, 8, 0, 0)).toEqual([255, 0, 0, 255])
    expect(pixelAt(px, 8, 6, 0)).toEqual([0, 0, 0, 0])
  })

  it('tolerance fills near-matching pixels but not distant ones', () => {
    const px = buffer(8, 1, [100, 100, 100, 255])
    // x=3 is slightly off-target (within tolerance 24); x=5 is far off
    const near = (3 * 4) as number
    px[near] = 110
    const far = 5 * 4
    px[far] = 200

    floodFill(px, 8, 1, 0, 0, 255, 0, 0, 255, 24)
    expect(pixelAt(px, 8, 3, 0)).toEqual([255, 0, 0, 255])
    // Distant pixel blocked the fill... but the 1px edge expansion bleeds
    // one pixel into it — its NEIGHBOUR beyond must stay untouched.
    expect(pixelAt(px, 8, 6, 0)).toEqual([100, 100, 100, 255])
  })

  it('expands 1px into the antialiased fringe', () => {
    const px = buffer(8, 1, [0, 0, 0, 0])
    // Halo pixel at x=3 (semi-transparent grey, outside tolerance 24),
    // then more transparent pixels beyond.
    const i = 3 * 4
    px[i + 3] = 128

    floodFill(px, 8, 1, 0, 0, 255, 0, 0, 255, 24)
    // The fringe pixel got painted by the expansion pass…
    expect(pixelAt(px, 8, 3, 0)).toEqual([255, 0, 0, 255])
    // …but the expansion does not cascade past it: x=4 is transparent and
    // was never part of the fill region, yet is adjacent to the painted
    // fringe. It must remain untouched.
    expect(pixelAt(px, 8, 5, 0)).toEqual([0, 0, 0, 0])
  })

  it('terminates when the fill colour is within tolerance of the target', () => {
    const px = buffer(16, 16, [250, 0, 0, 255])
    // Fill red-ish with pure red at tolerance 24: every painted pixel
    // still "matches" the target — the painted bitmask must prevent an
    // infinite walk.
    const ok = floodFill(px, 16, 16, 8, 8, 255, 0, 0, 255, 24)
    expect(ok).toBe(true)
    expect(pixelAt(px, 16, 0, 0)).toEqual([255, 0, 0, 255])
  })

  it('no-ops when the target already equals the fill colour', () => {
    const px = buffer(4, 4, [255, 0, 0, 255])
    expect(floodFill(px, 4, 4, 1, 1, 255, 0, 0, 255, 24)).toBe(false)
  })

  it('bounds constrain the fill to exactly the given rect', () => {
    const px = buffer(16, 16, [0, 0, 0, 0])
    const ok = floodFill(px, 16, 16, 5, 5, 255, 0, 0, 255, 24, { x: 4, y: 4, width: 6, height: 5 })
    expect(ok).toBe(true)
    // Every pixel inside the rect painted…
    expect(pixelAt(px, 16, 4, 4)).toEqual([255, 0, 0, 255])
    expect(pixelAt(px, 16, 9, 8)).toEqual([255, 0, 0, 255])
    // …and nothing outside it, including the fringe expansion.
    expect(pixelAt(px, 16, 3, 4)).toEqual([0, 0, 0, 0])
    expect(pixelAt(px, 16, 10, 8)).toEqual([0, 0, 0, 0])
    expect(pixelAt(px, 16, 4, 3)).toEqual([0, 0, 0, 0])
    expect(pixelAt(px, 16, 9, 9)).toEqual([0, 0, 0, 0])
    // Exact painted count = rect area
    let painted = 0
    for (let i = 0; i < px.length; i += 4) if (px[i + 3] === 255) painted++
    expect(painted).toBe(6 * 5)
  })

  it('refuses a seed outside the bounds', () => {
    const px = buffer(16, 16, [0, 0, 0, 0])
    const ok = floodFill(px, 16, 16, 1, 1, 255, 0, 0, 255, 24, { x: 4, y: 4, width: 6, height: 5 })
    expect(ok).toBe(false)
    expect(pixelAt(px, 16, 1, 1)).toEqual([0, 0, 0, 0])
  })
})
