import { test, expect, navigateTo } from './fixtures'
import type { Page } from '@playwright/test'

/**
 * Brush taper — pixel-level, like 21-canvas-selection.spec.ts: the spec sets
 * `window.__mentisTest` before the canvas opens, and reads the layer back
 * through the engine.
 */

async function createCanvasWithHooks(page: Page) {
  await page.evaluate(() => {
    ;(window as unknown as { __mentisTest?: object }).__mentisTest = {}
  })
  await page.keyboard.press('Control+n')
  await page.waitForTimeout(400)
  await page
    .getByRole('button', { name: 'Canvas' })
    .or(page.getByRole('menuitem', { name: 'Canvas' }))
    .first()
    .click()
  await page.waitForFunction(() => (window as any).__mentisTest?.canvasEngine, null, {
    timeout: 30_000,
  })
  await expect(page.locator('[class*="overflow-hidden"] canvas')).toBeVisible()
  await expect(page.getByText('Loading canvas…')).toBeHidden({ timeout: 15_000 })
}

/** Canvas-space point to page coordinates, through the live viewport. */
async function toScreen(page: Page, cx: number, cy: number): Promise<[number, number]> {
  const box = await page.locator('[class*="overflow-hidden"] canvas').boundingBox()
  if (!box) throw new Error('Canvas not visible')
  const vp = await page.evaluate(
    () => (window as any).__mentisTest.canvasEngine.viewportController.state,
  )
  return [box.x + cx * vp.zoom + vp.x, box.y + cy * vp.zoom + vp.y]
}

/** A mouse stroke from `from` to `to` (canvas space), many small moves like a real one. */
async function stroke(page: Page, from: [number, number], to: [number, number]) {
  const [sx, sy] = await toScreen(page, ...from)
  const [ex, ey] = await toScreen(page, ...to)
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move(ex, ey, { steps: 40 })
  await page.mouse.up()
  await page.waitForTimeout(400)
}

/** How many pixels of the active layer are painted in each column, left to right. */
async function columnProfile(page: Page): Promise<{ minX: number; heights: number[] }> {
  return page.evaluate(() => {
    const eng = (window as any).__mentisTest.canvasEngine
    const layer = eng.layerManager.getActiveLayer()
    const canvas = eng.layerManager.extractLayerCanvas(layer.id)
    const { width, height } = canvas
    const data = canvas.getContext('2d').getImageData(0, 0, width, height).data
    const heights: number[] = new Array(width).fill(0)
    for (let i = 3; i < data.length; i += 4) if (data[i] > 8) heights[(i >> 2) % width]++
    const minX = heights.findIndex((h) => h > 0)
    const maxX = heights.length - 1 - [...heights].reverse().findIndex((h) => h > 0)
    return { minX, heights: minX < 0 ? [] : heights.slice(minX, maxX + 1) }
  })
}

const mean = (a: number[]) => a.reduce((s, n) => s + n, 0) / Math.max(1, a.length)

test.describe('33 — Canvas brush taper', () => {
  test.beforeEach(async ({ vaultPage: page }) => {
    await navigateTo(page, 'vault')
    await createCanvasWithHooks(page)
    await page.keyboard.press('b')
  })

  test('33.1 A stroke is thinner at both ends than in the middle', async ({ vaultPage: page }) => {
    await stroke(page, [200, 300], [420, 300])
    const { heights } = await columnProfile(page)
    expect(heights.length).toBeGreaterThan(150)

    const middle = mean(heights.slice(heights.length / 2 - 10, heights.length / 2 + 10))
    expect(middle).toBeGreaterThan(4)
    expect(mean(heights.slice(0, 3))).toBeLessThan(middle * 0.6)
    expect(mean(heights.slice(-3))).toBeLessThan(middle * 0.6)
  })

  test('33.2 Taper at 0% leaves the ends as wide as the middle', async ({ vaultPage: page }) => {
    const taper = page.getByRole('slider', { name: 'Taper' })
    await taper.focus()
    await page.keyboard.press('Home')
    await expect(taper).toHaveAttribute('aria-valuenow', '0')

    await stroke(page, [200, 300], [420, 300])
    const { heights } = await columnProfile(page)
    const middle = mean(heights.slice(heights.length / 2 - 10, heights.length / 2 + 10))
    expect(mean(heights.slice(4, 8))).toBeGreaterThan(middle * 0.8)
    expect(mean(heights.slice(-8, -4))).toBeGreaterThan(middle * 0.8)
  })

  test('33.3 A click still leaves a full-size dot', async ({ vaultPage: page }) => {
    const [x, y] = await toScreen(page, 300, 300)
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.up()
    await page.waitForTimeout(400)
    const { heights } = await columnProfile(page)
    expect(heights.length).toBeGreaterThanOrEqual(5)
    expect(Math.max(...heights)).toBeGreaterThanOrEqual(5)
  })
})
