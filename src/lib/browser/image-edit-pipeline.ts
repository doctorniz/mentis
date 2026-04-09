/** Edge trim as fraction of width/height (0–0.35 typical). */
export type ImageCropEdges = { left: number; right: number; top: number; bottom: number }

export type ImageEditOpts = {
  rotation: number
  brightness: number
  contrast: number
  saturate: number
  crop: ImageCropEdges
}

export const defaultImageEditOpts = (): ImageEditOpts => ({
  rotation: 0,
  brightness: 1,
  contrast: 1,
  saturate: 1,
  crop: { left: 0, right: 0, top: 0, bottom: 0 },
})

/** PNG/JPEG/WebP only — reliable `canvas.toBlob` re-encode in browsers. */
export function isRasterImagePath(path: string): boolean {
  const e = path.split('.').pop()?.toLowerCase() ?? ''
  return ['png', 'jpg', 'jpeg', 'webp'].includes(e)
}

export function mimeForImagePath(path: string): string {
  const e = path.split('.').pop()?.toLowerCase() ?? ''
  if (e === 'png') return 'image/png'
  if (e === 'webp') return 'image/webp'
  return 'image/jpeg'
}

export function getCropSourceRect(
  iw: number,
  ih: number,
  crop: ImageCropEdges,
): { sx: number; sy: number; sw: number; sh: number } {
  const sx = Math.floor(iw * crop.left)
  const sy = Math.floor(ih * crop.top)
  const sw = Math.max(1, Math.floor(iw * (1 - crop.left - crop.right)))
  const sh = Math.max(1, Math.floor(ih * (1 - crop.top - crop.bottom)))
  return { sx, sy, sw, sh }
}

export function outputDimensionsAfterRotation(sw: number, sh: number, rotationDeg: number): { w: number; h: number } {
  const r = ((rotationDeg % 360) + 360) % 360
  if (r === 90 || r === 270) return { w: sh, h: sw }
  return { w: sw, h: sh }
}

/**
 * Draw edited image into ctx. Canvas `canvas.width` / `canvas.height` must already
 * equal the output size from `outputDimensionsAfterRotation` for the current crop + rotation.
 */
export function drawEditedImageOntoCanvas(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  opts: ImageEditOpts,
  outW: number,
  outH: number,
): void {
  const { sx, sy, sw, sh } = getCropSourceRect(img.naturalWidth, img.naturalHeight, opts.crop)
  const r = ((opts.rotation % 360) + 360) % 360
  ctx.clearRect(0, 0, outW, outH)
  ctx.save()
  ctx.filter = `brightness(${opts.brightness}) contrast(${opts.contrast}) saturate(${opts.saturate})`
  ctx.translate(outW / 2, outH / 2)
  ctx.rotate((r * Math.PI) / 180)
  ctx.drawImage(img, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh)
  ctx.restore()
}

export function hasImageEdits(opts: ImageEditOpts): boolean {
  return (
    opts.rotation !== 0 ||
    opts.brightness !== 1 ||
    opts.contrast !== 1 ||
    opts.saturate !== 1 ||
    opts.crop.left > 0 ||
    opts.crop.right > 0 ||
    opts.crop.top > 0 ||
    opts.crop.bottom > 0
  )
}
