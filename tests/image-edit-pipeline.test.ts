import { describe, it, expect } from 'vitest'
import {
  getCropSourceRect,
  outputDimensionsAfterRotation,
  hasImageEdits,
  defaultImageEditOpts,
  isRasterImagePath,
} from '@/lib/browser/image-edit-pipeline'

describe('image-edit-pipeline', () => {
  it('detects raster paths', () => {
    expect(isRasterImagePath('a/b.png')).toBe(true)
    expect(isRasterImagePath('x.JPEG')).toBe(true)
    expect(isRasterImagePath('f.gif')).toBe(false)
    expect(isRasterImagePath('f.svg')).toBe(false)
  })

  it('computes crop source rect', () => {
    const r = getCropSourceRect(100, 200, { left: 0.1, right: 0.1, top: 0, bottom: 0 })
    expect(r.sx).toBe(10)
    expect(r.sw).toBe(80)
    expect(r.sh).toBe(200)
  })

  it('swaps dimensions for 90° rotation', () => {
    expect(outputDimensionsAfterRotation(100, 200, 90)).toEqual({ w: 200, h: 100 })
    expect(outputDimensionsAfterRotation(100, 200, 0)).toEqual({ w: 100, h: 200 })
  })

  it('hasImageEdits', () => {
    expect(hasImageEdits(defaultImageEditOpts())).toBe(false)
    expect(hasImageEdits({ ...defaultImageEditOpts(), rotation: 90 })).toBe(true)
  })
})
