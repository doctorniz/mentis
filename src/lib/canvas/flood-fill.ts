/**
 * Iterative scanline flood fill on an RGBA8 pixel buffer.
 *
 * Implementation notes:
 *
 * - This is Smith's "span filling" variant: at each seed we walk the
 *   entire horizontal run of matching pixels in one pass and only
 *   push new seeds for contiguous matching runs in the row above and
 *   below. Compared with a naive 4-way recursive fill this avoids
 *   repeatedly re-testing pixels already inside the run and keeps the
 *   stack small (O(perimeter), not O(area)).
 *
 * - Iterative, not recursive — on a 2048×2048 layer a recursive fill
 *   would blow the JS call stack within a few seconds of sustained
 *   filling. The explicit number-stack also avoids object allocations
 *   per seed.
 *
 * - Colour matching accepts a per-channel `tolerance` (0 = exact).
 *   Filling next to soft/antialiased strokes with exact matching left
 *   an unfilled halo; tolerance + the 1px edge expansion below are the
 *   standard fix. A `painted` bitmask keeps the walk terminating even
 *   when the fill colour itself falls within tolerance of the target.
 *
 * - If the fill colour is byte-for-byte identical to the target we
 *   return early — repainting identical pixels would only produce a
 *   useless undo entry.
 *
 * - After the fill, every painted pixel bleeds 1px into unpainted
 *   neighbours (8-way), covering the antialiased fringe that sits just
 *   outside tolerance.
 *
 * The pixel buffer is mutated in place.
 */
export function floodFill(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  fillR: number,
  fillG: number,
  fillB: number,
  fillA: number,
  tolerance = 0,
  bounds?: { x: number; y: number; width: number; height: number },
): boolean {
  // Optional constraint rect (an active selection): pixels outside it
  // are treated as un-fillable boundary — the walk, the seed, and the
  // fringe expansion all stop at its edges.
  const bx0 = bounds ? Math.max(0, Math.floor(bounds.x)) : 0
  const by0 = bounds ? Math.max(0, Math.floor(bounds.y)) : 0
  const bx1 = bounds ? Math.min(width, Math.floor(bounds.x + bounds.width)) : width
  const by1 = bounds ? Math.min(height, Math.floor(bounds.y + bounds.height)) : height

  if (startX < bx0 || startX >= bx1 || startY < by0 || startY >= by1) return false

  const idx = (x: number, y: number) => (y * width + x) * 4

  const si = idx(startX, startY)
  const tR = pixels[si]
  const tG = pixels[si + 1]
  const tB = pixels[si + 2]
  const tA = pixels[si + 3]

  // No-op: clicking on a pixel that already matches the fill colour.
  if (tR === fillR && tG === fillG && tB === fillB && tA === fillA) return false

  /** 1 where the fill has painted; indexed by pixel (not byte). */
  const painted = new Uint8Array(width * height)

  const matches = (i: number): boolean =>
    painted[i >> 2] === 0 &&
    Math.abs(pixels[i] - tR) <= tolerance &&
    Math.abs(pixels[i + 1] - tG) <= tolerance &&
    Math.abs(pixels[i + 2] - tB) <= tolerance &&
    Math.abs(pixels[i + 3] - tA) <= tolerance

  const paint = (i: number): void => {
    pixels[i] = fillR
    pixels[i + 1] = fillG
    pixels[i + 2] = fillB
    pixels[i + 3] = fillA
    painted[i >> 2] = 1
  }

  // Stack of [x, y] seeds, stored as flat numbers to avoid allocation.
  const stack: number[] = [startX, startY]

  while (stack.length > 0) {
    const y = stack.pop()!
    const x = stack.pop()!

    // Walk left from the seed to find the leftmost matching pixel in
    // this row. The seed itself may already be painted (a neighbour
    // of an earlier run pushed it before reaching it in that run); in
    // that case `matches` fails at x and we skip the row.
    let xl = x
    while (xl >= bx0 && matches(idx(xl, y))) xl--
    xl++
    if (xl > x) continue // seed was already painted

    // Walk rightward, painting and tracking whether we're currently
    // inside an above/below run so we push at most one seed per run.
    let spanAbove = false
    let spanBelow = false

    for (let xr = xl; xr < bx1 && matches(idx(xr, y)); xr++) {
      paint(idx(xr, y))

      if (y > by0) {
        const aboveMatch = matches(idx(xr, y - 1))
        if (!spanAbove && aboveMatch) {
          stack.push(xr, y - 1)
          spanAbove = true
        } else if (spanAbove && !aboveMatch) {
          spanAbove = false
        }
      }

      if (y < by1 - 1) {
        const belowMatch = matches(idx(xr, y + 1))
        if (!spanBelow && belowMatch) {
          stack.push(xr, y + 1)
          spanBelow = true
        } else if (spanBelow && !belowMatch) {
          spanBelow = false
        }
      }
    }
  }

  // 1px edge expansion: paint the unfilled 8-neighbours of every filled
  // pixel so the antialiased fringe of adjacent soft strokes doesn't
  // survive as a halo. Collected first, painted after — expanding while
  // scanning would cascade.
  const fringe: number[] = []
  for (let y = by0; y < by1; y++) {
    for (let x = bx0; x < bx1; x++) {
      if (painted[y * width + x] === 0) continue
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const nx = x + dx
          const ny = y + dy
          if (nx < bx0 || nx >= bx1 || ny < by0 || ny >= by1) continue
          if (painted[ny * width + nx] === 0) fringe.push(idx(nx, ny))
        }
      }
    }
  }
  for (const i of fringe) paint(i)

  return true
}

/**
 * Convert `#rrggbb` + opacity (0–1) to a 4-tuple of 0–255 channels.
 * Alpha is the opacity mapped to a byte; we do *not* pre-multiply RGB
 * because ImageData is stored as straight (non-premultiplied) RGBA.
 */
export function hexToRgba(hex: string, alpha = 1): [number, number, number, number] {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
  return [r, g, b, a]
}

/** Convert 0–255 RGB channels to lowercase `#rrggbb`. Alpha is dropped. */
export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  const to2 = (v: number) => clamp(v).toString(16).padStart(2, '0')
  return `#${to2(r)}${to2(g)}${to2(b)}`
}
