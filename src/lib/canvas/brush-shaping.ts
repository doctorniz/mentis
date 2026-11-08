/**
 * How a brush stroke is shaped before it is stamped: the pressure curve, the
 * smoothing of pressure, and the taper at the ends. Pure functions, no pixi.
 *
 * The approach (a curve per brush, a taper timed along the stroke) follows
 * ProCraft's (MIT OR Apache-2.0); the code is Mentis's own.
 */

/** Taper's default strength, 0–1. */
export const DEFAULT_TAPER = 0.3
/** Pressure's default curve, 0 (firm) – 1 (soft); a little softer than linear. */
export const DEFAULT_PRESSURE = 0.6

/** The size a stroke's tip starts or ends at, as a fraction of full size. */
const TIP = 0.12
/** At full strength a taper runs this many brush sizes along the stroke. */
const TAPER_REACH = 8
/** A stroke this much shorter than its taper (a dot, a tick) stays full size. */
const SHORT_STROKE = 0.2
/** How far pressure moves toward each new sample: below 1, so it eases. */
const PRESSURE_FOLLOW = 0.5

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** The exponent of the pressure curve: 2 when firm, 1 at the middle, 0.5 when soft. */
export function pressureGamma(curve: number): number {
  return 2 ** (1 - 2 * clamp01(curve))
}

/** A pen's pressure (0–1) put through the brush's curve. */
export function shapePressure(raw: number, curve: number = DEFAULT_PRESSURE): number {
  return clamp01(raw) ** pressureGamma(curve)
}

/** Pressure eased toward the next sample, so small changes do not make a line wobble. */
export function smoothPressure(previous: number, next: number): number {
  return previous + (next - previous) * PRESSURE_FOLLOW
}

/** How far along a stroke, in pixels, its taper runs. 0 turns taper off. */
export function taperLength(size: number, taper: number = DEFAULT_TAPER): number {
  return Math.max(0, size) * clamp01(taper) * TAPER_REACH
}

/**
 * The fraction of full size at `along` pixels into a stroke. The start thins
 * over `length`; once the stroke's `total` length is known (it has ended) its
 * end does too, and a short stroke tapers over half of itself at each end.
 */
export function taperScale(along: number, length: number, total?: number): number {
  if (length <= 0) return 1
  let reach = length
  if (total !== undefined) {
    if (total < length * SHORT_STROKE) return 1
    reach = Math.min(length, total / 2)
  }
  const ease = (x: number) => {
    const t = clamp01(x)
    return TIP + (1 - TIP) * (t * t * (3 - 2 * t))
  }
  const start = ease(along / reach)
  return total === undefined ? start : Math.min(start, ease((total - along) / reach))
}
