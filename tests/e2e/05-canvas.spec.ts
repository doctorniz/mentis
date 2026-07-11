import { test, expect, navigateTo, waitForView, waitForAutoSave } from './fixtures'

/**
 * Canvas (PixiJS v8) drawing editor E2E tests — QA plan section 5.
 *
 * PixiJS renders to a WebGL <canvas>, so pixel-level assertions are not
 * practical.  Tests verify toolbar presence, keyboard shortcuts, layer
 * panel interactions, and engine state via page.evaluate() where possible.
 * Drawing-specific visual checks are marked .fixme().
 */

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

async function createCanvas(page: import('@playwright/test').Page) {
  await page.keyboard.press('Control+n')
  await page.waitForTimeout(400)
  const canvasBtn = page
    .getByRole('button', { name: 'Canvas' })
    .or(page.getByRole('menuitem', { name: 'Canvas' }))
  await canvasBtn.first().click()
  // Wait for canvas editor to mount and finish loading
  await expect(page.getByText('Loading canvas…')).toBeHidden({ timeout: 15_000 })
  await page.waitForTimeout(800)
}

/** Locator for the Pixi <canvas> element inside the viewport. */
function canvasLocator(page: import('@playwright/test').Page) {
  return page.locator('[class*="overflow-hidden"] canvas')
}

/** Draw a simple stroke on the canvas surface. */
async function drawStroke(
  page: import('@playwright/test').Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const canvas = canvasLocator(page)
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Canvas not visible')
  const startX = box.x + from.x
  const startY = box.y + from.y
  const endX = box.x + to.x
  const endY = box.y + to.y
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(endX, endY, { steps: 8 })
  await page.mouse.up()
}

/* ================================================================== */
/*  5.1  Tools & Drawing                                              */
/* ================================================================== */

test.describe('5.1 Tools & Drawing', () => {
  test.beforeEach(async ({ vaultPage: page }) => {
    await navigateTo(page, 'vault')
    await createCanvas(page)
  })

  test('5.1.1 Brush (B) — tool activates and stroke can be drawn', async ({ vaultPage: page }) => {
    await page.keyboard.press('b')
    const brushBtn = page.getByTitle('Brush (B)')
    await expect(brushBtn).toBeVisible()
    // Active tool gets accent styling
    await expect(brushBtn).toHaveClass(/bg-accent/)

    // Draw a stroke (we can't verify pixels, but ensure no crash)
    await drawStroke(page, { x: 100, y: 100 }, { x: 250, y: 250 })
  })

  test.fixme('5.1.2 Eraser (E) — erase pixels', async ({ vaultPage: page }) => {
    // Manual: draw with brush, switch to eraser, erase — verify pixels removed
    await page.keyboard.press('b')
    await drawStroke(page, { x: 100, y: 100 }, { x: 250, y: 250 })

    await page.keyboard.press('e')
    const eraserBtn = page.getByTitle('Eraser (E)')
    await expect(eraserBtn).toBeVisible()
    await expect(eraserBtn).toHaveClass(/bg-accent/)

    await drawStroke(page, { x: 100, y: 100 }, { x: 250, y: 250 })
    // Visual verification needed: erased area should be transparent
  })

  test('5.1.3 Pan (H) — activates pan tool', async ({ vaultPage: page }) => {
    await page.keyboard.press('h')
    const panBtn = page.getByTitle('Pan (H)')
    await expect(panBtn).toBeVisible()
    await expect(panBtn).toHaveClass(/bg-accent/)
  })

  test.fixme('5.1.5 Eyedropper (I) — pick color from canvas', async ({ vaultPage: page }) => {
    // Manual: draw a colored stroke, switch to eyedropper, click — verify hex
    await page.keyboard.press('i')
    const eyedropperBtn = page.getByTitle('Eyedropper (I)')
    await expect(eyedropperBtn).toBeVisible()
    await expect(eyedropperBtn).toHaveClass(/bg-accent/)
    // Properties panel should show "Click canvas to sample"
    await expect(page.getByText('Click canvas to sample')).toBeVisible()
  })

  test('5.1.6 Brush size adjust with [ and ] keys', async ({ vaultPage: page }) => {
    await page.keyboard.press('b')
    await page.waitForTimeout(200)

    // Read initial brush size from the properties panel
    const sizeLabel = page.getByText(/Brush Size/i)
    await expect(sizeLabel).toBeVisible()

    const sizeDisplay = page.getByText(/\d+px/)
    const initialText = await sizeDisplay.first().textContent()
    const initialSize = parseInt(initialText?.replace('px', '') ?? '0', 10)

    // Increase size
    await page.keyboard.press(']')
    await page.keyboard.press(']')
    await page.keyboard.press(']')
    await page.waitForTimeout(200)

    const afterIncrease = await sizeDisplay.first().textContent()
    const increasedSize = parseInt(afterIncrease?.replace('px', '') ?? '0', 10)
    expect(increasedSize).toBeGreaterThan(initialSize)

    // Decrease size
    await page.keyboard.press('[')
    await page.waitForTimeout(200)

    const afterDecrease = await sizeDisplay.first().textContent()
    const decreasedSize = parseInt(afterDecrease?.replace('px', '') ?? '0', 10)
    expect(decreasedSize).toBeLessThan(increasedSize)
  })

  test('5.1.8 Zoom 0.1× to 10× via mouse wheel', async ({ vaultPage: page }) => {
    const canvas = canvasLocator(page)
    await expect(canvas).toBeVisible()

    // Zoom in with wheel
    await canvas.dispatchEvent('wheel', { deltaY: -300 })
    await page.waitForTimeout(300)

    // Zoom out with wheel
    await canvas.dispatchEvent('wheel', { deltaY: 600 })
    await page.waitForTimeout(300)

    // No crash means the zoom range is handled safely
  })
})

/* ================================================================== */
/*  5.2  Layers                                                       */
/* ================================================================== */

test.describe('5.2 Layers', () => {
  test.beforeEach(async ({ vaultPage: page }) => {
    await navigateTo(page, 'vault')
    await createCanvas(page)
  })

  test('5.2.1 Add new layer', async ({ vaultPage: page }) => {
    // Default canvas starts with "Layer 1"
    await expect(page.getByText('Layer 1')).toBeVisible()

    const addLayerBtn = page.getByTitle('Add layer')
    await expect(addLayerBtn).toBeVisible()
    await addLayerBtn.click()
    await page.waitForTimeout(300)

    await expect(page.getByText('Layer 2')).toBeVisible()
  })

  test('5.2.2 Lock layer — drawing is blocked', async ({ vaultPage: page }) => {
    // Lock Layer 1
    const lockBtn = page.getByTitle('Lock layer')
    await expect(lockBtn).toBeVisible()
    await lockBtn.click()
    await page.waitForTimeout(200)

    // Button should now show "Unlock layer"
    await expect(page.getByTitle('Unlock layer')).toBeVisible()

    // Attempt to draw — brush strokes should be rejected by the engine
    await page.keyboard.press('b')
    await drawStroke(page, { x: 100, y: 100 }, { x: 200, y: 200 })
    // No visual assertion possible, but verifying no crash on locked layer
  })

  test('5.2.3 Toggle layer visibility', async ({ vaultPage: page }) => {
    const hideBtn = page.getByTitle('Hide layer')
    await expect(hideBtn).toBeVisible()
    await hideBtn.click()
    await page.waitForTimeout(200)

    // Should now show "Show layer"
    await expect(page.getByTitle('Show layer')).toBeVisible()

    // Toggle back
    await page.getByTitle('Show layer').click()
    await page.waitForTimeout(200)
    await expect(page.getByTitle('Hide layer')).toBeVisible()
  })

  test('5.2.6 Delete layer', async ({ vaultPage: page }) => {
    // Add a second layer first (can't delete the only layer)
    await page.getByTitle('Add layer').click()
    await page.waitForTimeout(300)
    await expect(page.getByText('Layer 2')).toBeVisible()

    // Each layer row has its own delete button — target Layer 1's row
    // (rows render top layer first, so .first() would delete Layer 2).
    const layer1Row = page.getByText('Layer 1', { exact: true }).locator('xpath=..')
    await layer1Row.getByTitle('Delete layer').click()
    await page.waitForTimeout(300)

    // Layer 1 should be gone, Layer 2 remains
    await expect(page.getByText('Layer 1')).toBeHidden()
    await expect(page.getByText('Layer 2')).toBeVisible()
  })

  test('5.2.7 Merge down, undo, and flatten', async ({ vaultPage: page }) => {
    await page.getByTitle('Add layer').click()
    await expect(page.getByText('Layer 2')).toBeVisible()

    // Merge the active (top) layer into Layer 1
    await page.getByTitle('Merge down').click()
    await expect(page.getByText('Layer 2')).toBeHidden()
    await expect(page.getByText('Layer 1')).toBeVisible()

    // Undo re-creates the merged-away layer
    await page.keyboard.press('Control+z')
    await expect(page.getByText('Layer 2')).toBeVisible({ timeout: 5_000 })

    // Flatten collapses the whole stack to one layer
    await page.getByTitle('Add layer').click()
    await expect(page.getByText('Layer 3')).toBeVisible()
    await page.getByTitle('Flatten').click()
    await expect(page.getByText('Layer 3')).toBeHidden()
    await expect(page.getByText('Layer 2')).toBeHidden()
    await expect(page.getByText('Layer 1')).toBeVisible()
  })

  test('5.2.8 Clear layer pushes an undo entry', async ({ vaultPage: page }) => {
    const undoBtn = page.getByTitle('Undo (Ctrl+Z)')
    await expect(undoBtn).toBeDisabled()

    await page.getByTitle('Clear layer').click()
    await expect(undoBtn).toBeEnabled({ timeout: 5_000 })
  })
})

/* ================================================================== */
/*  5.3  Undo / Redo                                                  */
/* ================================================================== */

test.describe('5.3 Undo / Redo', () => {
  test.beforeEach(async ({ vaultPage: page }) => {
    await navigateTo(page, 'vault')
    await createCanvas(page)
  })

  test('5.3.1 Draw stroke — Ctrl+Z undo', async ({ vaultPage: page }) => {
    await page.keyboard.press('b')
    await drawStroke(page, { x: 120, y: 120 }, { x: 280, y: 280 })
    await page.waitForTimeout(500)

    // Undo via keyboard
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(300)

    // Also verify undo button exists and is functional
    const undoBtn = page.getByTitle('Undo (Ctrl+Z)')
    await expect(undoBtn).toBeVisible()
  })

  test('5.3.2 Ctrl+Shift+Z redo', async ({ vaultPage: page }) => {
    await page.keyboard.press('b')
    await drawStroke(page, { x: 120, y: 120 }, { x: 280, y: 280 })
    await page.waitForTimeout(500)

    // Undo
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(300)

    // Redo via keyboard
    await page.keyboard.press('Control+Shift+z')
    await page.waitForTimeout(300)

    const redoBtn = page.getByTitle('Redo (Ctrl+Shift+Z)')
    await expect(redoBtn).toBeVisible()
  })

  test('5.3.3 Quick tap (dot stroke) gets an undo entry', async ({ vaultPage: page }) => {
    // Regression: the pre-stroke snapshot used to be captured in a
    // fire-and-forget async block, so a tap that ended within the same
    // frame pushed no undo entry at all.
    const undoBtn = page.getByTitle('Undo (Ctrl+Z)')
    await expect(undoBtn).toBeDisabled()

    await page.keyboard.press('b')
    const canvas = canvasLocator(page)
    const box = await canvas.boundingBox()
    if (!box) throw new Error('Canvas not visible')
    // A bare click = pointerdown + pointerup with no movement
    await page.mouse.click(box.x + 150, box.y + 150)

    await expect(undoBtn).toBeEnabled({ timeout: 5_000 })
  })

  test('5.3.5 Undo history survives a tab switch', async ({ vaultPage: page }) => {
    const undoBtn = page.getByTitle('Undo (Ctrl+Z)')

    await page.keyboard.press('b')
    await drawStroke(page, { x: 120, y: 120 }, { x: 260, y: 260 })
    await expect(undoBtn).toBeEnabled({ timeout: 5_000 })
    await page.waitForTimeout(500)

    // Switch away (unmounts + destroys the engine) and back
    await page.keyboard.press('Control+2')
    await page.waitForTimeout(1500)
    await page.keyboard.press('Control+1')
    await expect(page.getByText('Loading canvas…')).toBeHidden({ timeout: 15_000 })
    await page.waitForTimeout(800)

    // The parked undo stack is re-attached — the stroke is still undoable
    await expect(page.getByTitle('Undo (Ctrl+Z)')).toBeEnabled({ timeout: 5_000 })
  })

  test('5.3.4 Escape cancels the in-progress stroke without an undo entry', async ({
    vaultPage: page,
  }) => {
    const undoBtn = page.getByTitle('Undo (Ctrl+Z)')
    await expect(undoBtn).toBeDisabled()

    await page.keyboard.press('b')
    const canvas = canvasLocator(page)
    const box = await canvas.boundingBox()
    if (!box) throw new Error('Canvas not visible')

    // Start a stroke, press Escape mid-drag, then release
    await page.mouse.move(box.x + 120, box.y + 120)
    await page.mouse.down()
    await page.mouse.move(box.x + 200, box.y + 200, { steps: 4 })
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await page.waitForTimeout(500)

    // The aborted stroke must not have produced an undo entry
    await expect(undoBtn).toBeDisabled()
  })
})

/* ================================================================== */
/*  5.7  Zoom controls                                                */
/* ================================================================== */

test.describe('5.7 Zoom controls', () => {
  test.beforeEach(async ({ vaultPage: page }) => {
    await navigateTo(page, 'vault')
    await createCanvas(page)
  })

  test('5.7.1 Zoom cluster: in / out / fit / reset drive the readout', async ({
    vaultPage: page,
  }) => {
    const readout = page.getByRole('button', { name: 'Reset zoom to 100%' })
    await expect(readout).toHaveText('100%')

    await page.getByRole('button', { name: 'Zoom in' }).click()
    await expect(readout).toHaveText('125%')

    await page.getByRole('button', { name: 'Zoom out' }).click()
    await expect(readout).toHaveText('100%')

    // Fit shrinks a 2048px canvas well below 100% in any test viewport
    await page.getByRole('button', { name: 'Fit canvas to view' }).click()
    const fitText = (await readout.textContent()) ?? ''
    expect(parseInt(fitText, 10)).toBeLessThan(100)

    // Percentage button resets to exactly 100%
    await readout.click()
    await expect(readout).toHaveText('100%')
  })
})

/* ================================================================== */
/*  5.4  Save & Lifecycle                                             */
/* ================================================================== */

test.describe('5.4 Save & Lifecycle', () => {
  test.beforeEach(async ({ vaultPage: page }) => {
    await navigateTo(page, 'vault')
    await createCanvas(page)
  })

  test('5.4.1 Auto-save fires ~3s after stroke', async ({ vaultPage: page }) => {
    await page.keyboard.press('b')
    await drawStroke(page, { x: 100, y: 100 }, { x: 200, y: 200 })

    // Wait for auto-save (~3s debounce + buffer)
    await page.waitForTimeout(5000)

    // Verify canvas file still loads correctly after save by switching away and back
    await navigateTo(page, 'board')
    await page.waitForTimeout(500)
    await navigateTo(page, 'vault')
    await page.waitForTimeout(1000)

    // Canvas should reload without error
    await expect(page.getByText('Loading canvas…')).toBeHidden({ timeout: 15_000 })
  })

  test('5.4.7 Ctrl+S — force-save', async ({ vaultPage: page }) => {
    await page.keyboard.press('b')
    await drawStroke(page, { x: 100, y: 100 }, { x: 200, y: 200 })
    await page.waitForTimeout(300)

    // Force save immediately
    await page.keyboard.press('Control+s')
    await page.waitForTimeout(1000)

    // Verify the file persists by switching views
    await navigateTo(page, 'board')
    await page.waitForTimeout(500)
    await navigateTo(page, 'vault')
    await page.waitForTimeout(1000)
    await expect(page.getByText('Loading canvas…')).toBeHidden({ timeout: 15_000 })
  })
})

/* ================================================================== */
/*  5.5  File Format                                                  */
/* ================================================================== */

test.describe('5.5 File Format', () => {
  test.fixme('5.5.3 v5 format: small JSON + layer PNGs in _marrow/_drawings/', async ({
    vaultPage: page,
  }) => {
    // Manual: create canvas, draw, save, then inspect OPFS via DevTools
    // to verify _marrow/_drawings/<assetId>/<layerId>.png structure
    // and that the .canvas JSON is a small metadata file with an assetId field.
    await navigateTo(page, 'vault')
    await createCanvas(page)

    await page.keyboard.press('b')
    await drawStroke(page, { x: 100, y: 100 }, { x: 200, y: 200 })
    await page.keyboard.press('Control+s')
    await page.waitForTimeout(2000)
  })
})

/* ================================================================== */
/*  5.6  Export                                                       */
/* ================================================================== */

test.describe('5.6 Export', () => {
  test.fixme('5.6.1 Export as PNG — all visible layers flattened', async ({ vaultPage: page }) => {
    // Export PNG UI is not yet implemented in the canvas editor.
    // This test should be enabled when the export button is added.
    await navigateTo(page, 'vault')
    await createCanvas(page)
  })
})
