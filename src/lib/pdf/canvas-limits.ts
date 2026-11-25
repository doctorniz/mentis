/**
 * The most pixels one PDF page canvas may hold. A phone or tablet web view
 * (iOS above all) is killed once canvases use too much memory, so there pages
 * past the limit are drawn at a lower resolution and stretched instead: softer,
 * never a crash. The figures are PDF.js's own (`maxCanvasPixels`).
 */
export function maxCanvasPixels(): number {
  if (typeof navigator === 'undefined') return DESKTOP
  const ua = navigator.userAgent
  const mobile =
    /Android|iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  return mobile ? MOBILE : DESKTOP
}

const MOBILE = 5_242_880
const DESKTOP = 16_777_216

/** The factor (at most 1) that brings a `width` × `height` canvas within `max` pixels. */
export function canvasScale(width: number, height: number, max = maxCanvasPixels()): number {
  const area = width * height
  return area > max ? Math.sqrt(max / area) : 1
}

/** Frees a canvas's memory at once: WebKit otherwise holds it until collected. */
export function releaseCanvas(c: HTMLCanvasElement | null | undefined): void {
  if (!c) return
  c.width = 0
  c.height = 0
}
