import { test, expect, navigateTo, writeVaultFile, openVaultFile } from './fixtures'

/**
 * 1×1 red pixel PNG (smallest valid raster image for testing).
 */
const PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='

/**
 * Tiny valid 1×1 GIF89a (for non-editable preview path).
 */
const PIXEL_GIF = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

async function writeImageToVault(
  page: import('@playwright/test').Page,
  filename: string,
  b64: string,
) {
  await writeVaultFile(page, filename, b64, { base64: true })
}

async function openFileInVault(page: import('@playwright/test').Page, filename: string) {
  await openVaultFile(page, filename)
  await page.waitForTimeout(500)
}

/* ------------------------------------------------------------------ */
/*  15.1 — Editing Operations                                         */
/* ------------------------------------------------------------------ */

test.describe('15.1 — Image Editing Operations', () => {
  test('15.1.1 Open PNG — ImageEditorView with toolbar', async ({ vaultPage: page }) => {
    await writeImageToVault(page, 'test-image.png', PIXEL_PNG)
    await openFileInVault(page, 'test-image.png')

    // The image edit toolbar should appear with role="toolbar"
    const toolbar = page.locator('[role="toolbar"][aria-label="Image edit tools"]')
    await expect(toolbar).toBeVisible({ timeout: 15_000 })

    // Rotation buttons should be present
    await expect(page.locator('[aria-label="Rotate 90° clockwise"]')).toBeVisible()
    await expect(page.locator('[aria-label="Rotate 90° counter-clockwise"]')).toBeVisible()

    // Adjustment sliders (brightness, contrast, saturation via sr-only labels)
    await expect(page.locator('label').filter({ hasText: 'Brightness' }).first()).toBeAttached()
    await expect(page.locator('label').filter({ hasText: 'Contrast' }).first()).toBeAttached()
    await expect(page.locator('label').filter({ hasText: 'Saturation' }).first()).toBeAttached()
  })

  test('15.1.1b Open JPEG — ImageEditorView with toolbar', async ({ vaultPage: page }) => {
    // JPEG uses the same raster pipeline; verify toolbar appears
    await writeImageToVault(page, 'photo.jpg', PIXEL_PNG) // Valid bytes don't matter for toolbar detection
    await openFileInVault(page, 'photo.jpg')

    const toolbar = page.locator('[role="toolbar"][aria-label="Image edit tools"]')
    await expect(toolbar).toBeVisible({ timeout: 15_000 })
  })

  test('15.1.1c Open WebP — ImageEditorView with toolbar', async ({ vaultPage: page }) => {
    await writeImageToVault(page, 'photo.webp', PIXEL_PNG)
    await openFileInVault(page, 'photo.webp')

    const toolbar = page.locator('[role="toolbar"][aria-label="Image edit tools"]')
    await expect(toolbar).toBeVisible({ timeout: 15_000 })
  })

  test('15.1.2 Rotate clockwise — rotation increments 90°', async ({ vaultPage: page }) => {
    await writeImageToVault(page, 'rotate-test.png', PIXEL_PNG)
    await openFileInVault(page, 'rotate-test.png')

    const toolbar = page.locator('[role="toolbar"][aria-label="Image edit tools"]')
    await expect(toolbar).toBeVisible({ timeout: 15_000 })

    const rotateCw = page.locator('[aria-label="Rotate 90° clockwise"]')
    await rotateCw.click()

    // After rotation the Save button should become active (edits are dirty)
    const saveBtn = page.locator('button:has-text("Save")')
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 })
  })

  test('15.1.2b Rotate counter-clockwise', async ({ vaultPage: page }) => {
    await writeImageToVault(page, 'rotate-ccw.png', PIXEL_PNG)
    await openFileInVault(page, 'rotate-ccw.png')

    const toolbar = page.locator('[role="toolbar"][aria-label="Image edit tools"]')
    await expect(toolbar).toBeVisible({ timeout: 15_000 })

    const rotateCcw = page.locator('[aria-label="Rotate 90° counter-clockwise"]')
    await rotateCcw.click()

    const saveBtn = page.locator('button:has-text("Save")')
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 })
  })

  test('15.1.4 Brightness slider changes value', async ({ vaultPage: page }) => {
    await writeImageToVault(page, 'bright.png', PIXEL_PNG)
    await openFileInVault(page, 'bright.png')

    const toolbar = page.locator('[role="toolbar"][aria-label="Image edit tools"]')
    await expect(toolbar).toBeVisible({ timeout: 15_000 })

    // The brightness slider is the first range input after the rotate buttons
    const brightnessSlider = page.locator(
      'label:has(.sr-only:text("Brightness")) input[type="range"]',
    )
    await expect(brightnessSlider).toBeVisible()

    // Shift the slider value — default is 100
    await brightnessSlider.fill('120')

    // Save button should be enabled (image is dirty)
    const saveBtn = page.locator('button:has-text("Save")')
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 })
  })

  test('15.1.5 Contrast slider changes value', async ({ vaultPage: page }) => {
    await writeImageToVault(page, 'contrast.png', PIXEL_PNG)
    await openFileInVault(page, 'contrast.png')

    const toolbar = page.locator('[role="toolbar"][aria-label="Image edit tools"]')
    await expect(toolbar).toBeVisible({ timeout: 15_000 })

    const contrastSlider = page.locator('label:has(.sr-only:text("Contrast")) input[type="range"]')
    await expect(contrastSlider).toBeVisible()
    await contrastSlider.fill('130')

    const saveBtn = page.locator('button:has-text("Save")')
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 })
  })

  test('15.1.6 Saturation slider changes value', async ({ vaultPage: page }) => {
    await writeImageToVault(page, 'saturate.png', PIXEL_PNG)
    await openFileInVault(page, 'saturate.png')

    const toolbar = page.locator('[role="toolbar"][aria-label="Image edit tools"]')
    await expect(toolbar).toBeVisible({ timeout: 15_000 })

    const satSlider = page.locator('label:has(.sr-only:text("Saturation")) input[type="range"]')
    await expect(satSlider).toBeVisible()
    await satSlider.fill('150')

    const saveBtn = page.locator('button:has-text("Save")')
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 })
  })

  // Requires visual pixel comparison to verify edits survived round-trip
  test.fixme('15.1.7 Combine edits → save → reopen → persisted', async ({ vaultPage: page }) => {
    await writeImageToVault(page, 'combined.png', PIXEL_PNG)
    await openFileInVault(page, 'combined.png')

    const toolbar = page.locator('[role="toolbar"][aria-label="Image edit tools"]')
    await expect(toolbar).toBeVisible({ timeout: 15_000 })

    // Rotate + brightness
    await page.locator('[aria-label="Rotate 90° clockwise"]').click()
    const brightnessSlider = page.locator(
      'label:has(.sr-only:text("Brightness")) input[type="range"]',
    )
    await brightnessSlider.fill('130')

    // Save
    const saveBtn = page.locator('button:has-text("Save")')
    await saveBtn.click()
    await page.waitForTimeout(2000)

    // Reopen by switching away and back
    await navigateTo(page, 'board')
    await page.waitForTimeout(500)
    await openFileInVault(page, 'combined.png')

    // Toolbar should be visible again — visual verification that bytes persisted
    await expect(toolbar).toBeVisible({ timeout: 15_000 })
  })

  test('15.1.8 Undo all edits — revert to original', async ({ vaultPage: page }) => {
    await writeImageToVault(page, 'undo-test.png', PIXEL_PNG)
    await openFileInVault(page, 'undo-test.png')

    const toolbar = page.locator('[role="toolbar"][aria-label="Image edit tools"]')
    await expect(toolbar).toBeVisible({ timeout: 15_000 })

    // Make an edit
    await page.locator('[aria-label="Rotate 90° clockwise"]').click()
    const saveBtn = page.locator('button:has-text("Save")')
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 })

    // Click the reset/undo button
    const resetBtn = page.locator('[aria-label="Reset adjustments"]')
    await resetBtn.click()

    // Save button should be disabled again (no edits)
    await expect(saveBtn).toBeDisabled({ timeout: 5_000 })
  })

  test('15.1.9 Open GIF — plain preview, no edit tools', async ({ vaultPage: page }) => {
    await writeImageToVault(page, 'anim.gif', PIXEL_GIF)
    await openFileInVault(page, 'anim.gif')

    // Should show a plain <img> preview without the toolbar
    const toolbar = page.locator('[role="toolbar"][aria-label="Image edit tools"]')
    await expect(toolbar).not.toBeVisible({ timeout: 5_000 })

    // An <img> tag should be rendered instead
    const img = page.locator('img[alt]')
    await expect(img).toBeVisible({ timeout: 10_000 })
  })

  test('15.1.9b Open SVG — plain preview, no edit tools', async ({ vaultPage: page }) => {
    const SVG_B64 = btoa('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>')

    await writeVaultFile(page, 'icon.svg', SVG_B64, { base64: true })
    await openFileInVault(page, 'icon.svg')

    // No edit toolbar for SVGs
    const toolbar = page.locator('[role="toolbar"][aria-label="Image edit tools"]')
    await expect(toolbar).not.toBeVisible({ timeout: 5_000 })
  })
})
