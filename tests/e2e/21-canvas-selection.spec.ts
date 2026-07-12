import { test, expect, navigateTo } from './fixtures'
import type { Page } from '@playwright/test'

/**
 * Canvas selection tool E2E — QA plan section 5.8.
 *
 * Unlike 05-canvas.spec.ts (which can only assert UI state because Pixi
 * renders to WebGL), these tests make PIXEL-LEVEL assertions: the spec
 * sets `window.__mentisTest = {}` before opening a canvas, the canvas
 * editor registers its engine there, and helpers read layer pixels back
 * through `extractLayerCanvas`. This also regression-covers the Pixi
 * extract-frame fix — region-scoped undo restores used to stamp the
 * whole layer shifted by +region origin, which only pixel assertions
 * can catch.
 */

/* ------------------------------------------------------------------ */
/*  Types & helpers                                                    */
/* ------------------------------------------------------------------ */

interface LayerStats {
  px: number
  bbox: { minX: number; minY: number; maxX: number; maxY: number } | null
}

async function createCanvasWithHooks(page: Page) {
  // The hook marker must exist before the canvas editor mounts.
  await page.evaluate(() => {
    ;(window as unknown as { __mentisTest?: object }).__mentisTest = {}
  })
  await page.keyboard.press('Control+n')
  await page.waitForTimeout(400)
  const canvasBtn = page
    .getByRole('button', { name: 'Canvas' })
    .or(page.getByRole('menuitem', { name: 'Canvas' }))
  await canvasBtn.first().click()
  await expect(page.getByText('Loading canvas…')).toBeHidden({ timeout: 15_000 })
  await page.waitForTimeout(800)
}

function canvasLocator(page: Page) {
  return page.locator('[class*="overflow-hidden"] canvas')
}

/** Count non-transparent pixels + bounding box of the ACTIVE layer. */
async function layerStats(page: Page): Promise<LayerStats> {
  return page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const eng = (window as any).__mentisTest?.canvasEngine
    if (!eng?.initialized) throw new Error('canvas engine test hook not registered')
    const layer = eng.layerManager.getActiveLayer()
    const canvas = eng.layerManager.extractLayerCanvas(layer.id)
    const ctx = canvas.getContext('2d')
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let px = 0
    let minX = Infinity
    let minY = Infinity
    let maxX = -1
    let maxY = -1
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 8) {
        px++
        const p = i / 4
        const x = p % canvas.width
        const y = Math.floor(p / canvas.width)
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
    return { px, bbox: px ? { minX, minY, maxX, maxY } : null }
  })
}

async function selectionState(page: Page) {
  return page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const eng = (window as any).__mentisTest?.canvasEngine
    return {
      rect: eng.selectionTool.rect,
      isMoving: eng.selectionTool.isMoving,
      undoDepth: eng.undoManager.exportState().past.length,
    }
  })
}

/** Map canvas-space coords to page coords through the live viewport. */
async function canvasToScreen(page: Page, cx: number, cy: number): Promise<[number, number]> {
  const box = await canvasLocator(page).boundingBox()
  if (!box) throw new Error('Canvas not visible')
  const vp = await page.evaluate(
    () =>
      /* eslint-disable @typescript-eslint/no-explicit-any */
      (window as any).__mentisTest.canvasEngine.viewportController.state as {
        x: number
        y: number
        zoom: number
      },
  )
  return [box.x + cx * vp.zoom + vp.x, box.y + cy * vp.zoom + vp.y]
}

/** Drag in CANVAS-space coordinates (mapped through the viewport). */
async function dragCanvas(page: Page, fx: number, fy: number, tx: number, ty: number) {
  const [sx, sy] = await canvasToScreen(page, fx, fy)
  const [ex, ey] = await canvasToScreen(page, tx, ty)
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move((sx + ex) / 2, (sy + ey) / 2, { steps: 4 })
  await page.mouse.move(ex, ey, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(300)
}

/**
 * Marquee (110,110)-(340,340) around the standard test stroke, then move
 * the selection by a small delta. Returns the marquee origin (the rect
 * the selection had before the move) so callers can relate the final
 * selection rect to the pixel shift. Coordinates leave margin so they
 * stay inside the canvas element even at 125% zoom with a panned view.
 */
async function selectionMarqueeAndMove(page: Page): Promise<{ x: number; y: number }> {
  await dragCanvas(page, 110, 110, 340, 340)
  await dragCanvas(page, 225, 225, 280, 260) // move +55/+35 (canvas-space)
  return { x: 110, y: 110 }
}

/* ================================================================== */
/*  5.8  Selection                                                    */
/* ================================================================== */

test.describe('5.8 Selection', () => {
  test.beforeEach(async ({ vaultPage: page }) => {
    await navigateTo(page, 'vault')
    await createCanvasWithHooks(page)
  })

  test('5.8.1 marquee move translates pixels exactly', async ({ vaultPage: page }) => {
    await page.keyboard.press('b')
    await dragCanvas(page, 150, 150, 300, 300)
    await page.waitForTimeout(400)
    const before = await layerStats(page)
    expect(before.px).toBeGreaterThan(0)

    await page.keyboard.press('m')
    await dragCanvas(page, 100, 100, 350, 350) // marquee around the stroke
    await dragCanvas(page, 225, 225, 300, 300) // move +75/+75
    await page.waitForTimeout(400)

    const after = await layerStats(page)
    expect(after.px).toBe(before.px) // no pixels gained or lost
    expect(after.bbox).toEqual({
      minX: before.bbox!.minX + 75,
      minY: before.bbox!.minY + 75,
      maxX: before.bbox!.maxX + 75,
      maxY: before.bbox!.maxY + 75,
    })
  })

  test('5.8.2 move undo/redo is pixel-exact with other strokes on the layer (region-restore regression)', async ({
    vaultPage: page,
  }) => {
    // A second stroke on the layer is the regression trigger: the old
    // extract-frame bug made a region undo restore the WHOLE layer
    // shifted by +region origin, duplicating unrelated content.
    await page.keyboard.press('b')
    await dragCanvas(page, 120, 120, 250, 250) // stroke A
    await dragCanvas(page, 130, 330, 300, 430) // stroke B
    await page.waitForTimeout(400)
    const original = await layerStats(page)

    await page.keyboard.press('m')
    await dragCanvas(page, 100, 300, 330, 460) // marquee around B only
    await dragCanvas(page, 215, 380, 280, 380) // move B by +65 x
    await page.waitForTimeout(400)
    const moved = await layerStats(page)
    expect(moved.px).toBe(original.px)

    await page.keyboard.press('Control+z')
    await page.waitForTimeout(600)
    const undone = await layerStats(page)
    expect(undone.px).toBe(original.px) // duplicated content would inflate this
    expect(undone.bbox).toEqual(original.bbox)

    await page.keyboard.press('Control+Shift+z')
    await page.waitForTimeout(600)
    const redone = await layerStats(page)
    expect(redone.px).toBe(moved.px)
    expect(redone.bbox).toEqual(moved.bbox)
  })

  test('5.8.3 Delete erases only the marquee region; undo restores', async ({
    vaultPage: page,
  }) => {
    await page.keyboard.press('b')
    await dragCanvas(page, 150, 150, 300, 300)
    await page.waitForTimeout(400)
    const before = await layerStats(page)

    await page.keyboard.press('m')
    await dragCanvas(page, 100, 100, 350, 225) // top half of the stroke
    await page.keyboard.press('Delete')
    await page.waitForTimeout(500)

    const after = await layerStats(page)
    expect(after.px).toBeGreaterThan(0)
    expect(after.px).toBeLessThan(before.px)
    expect(after.bbox!.minY).toBeGreaterThanOrEqual(225) // cut exactly at the marquee edge

    await page.keyboard.press('Control+z')
    await page.waitForTimeout(600)
    const restored = await layerStats(page)
    expect(restored.px).toBe(before.px)
    expect(restored.bbox).toEqual(before.bbox)
  })

  test('5.8.4 cut / paste round-trip; paste is immediately movable', async ({
    vaultPage: page,
  }) => {
    await page.keyboard.press('b')
    await dragCanvas(page, 150, 150, 300, 300)
    await page.waitForTimeout(400)
    const original = await layerStats(page)

    await page.keyboard.press('Control+a') // select all (switches to Select)
    await page.keyboard.press('Control+x')
    await page.waitForTimeout(500)
    expect((await layerStats(page)).px).toBe(0)

    await page.keyboard.press('Control+v') // paste lands at source position
    await page.waitForTimeout(500)
    const pasted = await layerStats(page)
    expect(pasted.px).toBe(original.px)
    expect(pasted.bbox).toEqual(original.bbox)

    // The paste is selected — re-marquee and move to prove it's live pixels
    await page.keyboard.press('Escape')
    await dragCanvas(page, 100, 100, 350, 350)
    await dragCanvas(page, 225, 225, 285, 285) // +60/+60
    await page.waitForTimeout(400)
    const moved = await layerStats(page)
    expect(moved.px).toBe(original.px)
    expect(moved.bbox!.minX).toBe(original.bbox!.minX + 60)
  })

  test('5.8.5 Escape mid-move restores pixels and pushes no undo entry', async ({
    vaultPage: page,
  }) => {
    await page.keyboard.press('b')
    await dragCanvas(page, 150, 150, 300, 300)
    await page.waitForTimeout(400)
    const before = await layerStats(page)
    const { undoDepth } = await selectionState(page)

    await page.keyboard.press('m')
    await dragCanvas(page, 100, 100, 350, 350)

    const [gx, gy] = await canvasToScreen(page, 225, 225)
    await page.mouse.move(gx, gy)
    await page.mouse.down()
    await page.mouse.move(gx + 80, gy + 80, { steps: 4 })
    await page.waitForTimeout(200)
    expect((await layerStats(page)).px).toBe(0) // whole stroke is floating
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await page.waitForTimeout(400)

    const after = await layerStats(page)
    expect(after.px).toBe(before.px)
    expect(after.bbox).toEqual(before.bbox)
    expect((await selectionState(page)).undoDepth).toBe(undoDepth) // no entry for the abort
  })

  test('5.8.6 locked layer: move and delete refused, copy still allowed', async ({
    vaultPage: page,
  }) => {
    await page.keyboard.press('b')
    await dragCanvas(page, 150, 150, 300, 300)
    await page.waitForTimeout(400)
    const original = await layerStats(page)

    await page.keyboard.press('m')
    await dragCanvas(page, 100, 100, 350, 350)
    await page.locator('[title="Lock layer"]').first().click()
    await page.waitForTimeout(200)

    // Copy is read-only — allowed while locked
    await page.keyboard.press('Control+c')

    // Move attempt: must not float; a fresh marquee starts instead
    const [gx, gy] = await canvasToScreen(page, 225, 225)
    await page.mouse.move(gx, gy)
    await page.mouse.down()
    await page.mouse.move(gx + 50, gy + 50, { steps: 3 })
    expect((await selectionState(page)).isMoving).toBe(false)
    await page.mouse.up()
    await page.waitForTimeout(200)

    // Delete: no-op while locked
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Delete')
    await page.waitForTimeout(400)
    expect((await layerStats(page)).px).toBe(original.px)

    // Unlock → delete works → paste restores from the locked-copy
    await page.locator('[title="Unlock layer"]').first().click()
    await page.waitForTimeout(200)
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Delete')
    await page.waitForTimeout(400)
    expect((await layerStats(page)).px).toBe(0)

    await page.keyboard.press('Control+v')
    await page.waitForTimeout(500)
    const pasted = await layerStats(page)
    expect(pasted.px).toBe(original.px)
    expect(pasted.bbox).toEqual(original.bbox)
  })

  test('5.8.7 move under zoom + pan stays pixel-exact', async ({ vaultPage: page }) => {
    await page.keyboard.press('b')
    await dragCanvas(page, 150, 150, 300, 300)
    await page.waitForTimeout(400)
    const before = await layerStats(page)

    // Zoom to 125% and pan the viewport — dragCanvas/canvasToScreen map
    // through the live viewport state, so the same canvas-space script
    // now exercises non-identity transforms.
    await page.getByRole('button', { name: 'Zoom in' }).click()
    await page.waitForTimeout(200)
    await page.keyboard.press('h')
    const box = (await canvasLocator(page).boundingBox())!
    await page.mouse.move(box.x + 300, box.y + 300)
    await page.mouse.down()
    await page.mouse.move(box.x + 380, box.y + 340, { steps: 4 }) // pan +80/+40
    await page.mouse.up()
    await page.waitForTimeout(200)

    await page.keyboard.press('m')
    const marquee = await selectionMarqueeAndMove(page)
    await page.waitForTimeout(400)

    const after = await layerStats(page)
    const { rect } = await selectionState(page)
    expect(after.px).toBe(before.px)
    // Pixels must land exactly where the selection rect says they did —
    // the rect's delta from its marquee origin IS the move.
    expect(after.bbox!.minX - before.bbox!.minX).toBe(rect.x - marquee.x)
    expect(after.bbox!.minY - before.bbox!.minY).toBe(rect.y - marquee.y)
  })

  test('5.8.9 arrow keys nudge the selection; one undo entry per burst', async ({
    vaultPage: page,
  }) => {
    await page.keyboard.press('b')
    await dragCanvas(page, 150, 150, 300, 300)
    await page.waitForTimeout(400)
    const before = await layerStats(page)
    const { undoDepth } = await selectionState(page)

    await page.keyboard.press('m')
    await dragCanvas(page, 100, 100, 350, 350)

    // Burst: 3× right (1px each) + 1× Shift+Down (10px)
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Shift+ArrowDown')
    // Mid-burst the pixels are floating (layer shows the hole)…
    expect((await layerStats(page)).px).toBe(0)
    // …and the debounced commit lands them after the pause.
    await page.waitForTimeout(900)

    const after = await layerStats(page)
    expect(after.px).toBe(before.px)
    expect(after.bbox).toEqual({
      minX: before.bbox!.minX + 3,
      minY: before.bbox!.minY + 10,
      maxX: before.bbox!.maxX + 3,
      maxY: before.bbox!.maxY + 10,
    })
    // The whole burst is ONE undo entry…
    expect((await selectionState(page)).undoDepth).toBe(undoDepth + 1)
    // …and undoing it restores the original pixels exactly.
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(600)
    const undone = await layerStats(page)
    expect(undone.px).toBe(before.px)
    expect(undone.bbox).toEqual(before.bbox)
  })

  test('5.8.10 cursor shows move over the selection, crosshair elsewhere', async ({
    vaultPage: page,
  }) => {
    await page.keyboard.press('m')
    await dragCanvas(page, 100, 100, 350, 350)

    const host = canvasLocator(page).locator('..')
    const cursorAt = async (cx: number, cy: number) => {
      const [sx, sy] = await canvasToScreen(page, cx, cy)
      await page.mouse.move(sx, sy)
      await page.waitForTimeout(150)
      return host.evaluate((el) => getComputedStyle(el).cursor)
    }

    expect(await cursorAt(225, 225)).toBe('move') // inside the marquee
    expect(await cursorAt(420, 60)).toBe('crosshair') // outside it
    expect(await cursorAt(225, 225)).toBe('move') // and back
  })

  test('5.8.8 eyedropper samples the clicked pixel, not (0,0) (regression)', async ({
    vaultPage: page,
  }) => {
    // Paint a dot at a known point, then composite-sample on and off it.
    // The old extract-frame bug made every sample read layer pixel (0,0).
    await page.keyboard.press('b')
    const [dx, dy] = await canvasToScreen(page, 200, 200)
    await page.mouse.click(dx, dy)
    await page.waitForTimeout(400)

    const samples = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const eng = (window as any).__mentisTest.canvasEngine
      return {
        onStroke: eng.layerManager.sampleCompositedPixel(200, 200, eng.background),
        offStroke: eng.layerManager.sampleCompositedPixel(600, 600, eng.background),
      }
    })
    // On the stroke: dark ink. Off it: the white canvas background.
    expect(samples.onStroke.r).toBeLessThan(100)
    expect(samples.offStroke.r).toBe(255)
    expect(samples.offStroke.g).toBe(255)
    expect(samples.offStroke.b).toBe(255)
  })
})
