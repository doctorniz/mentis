import { test, expect, navigateTo } from './fixtures'

const SETTINGS_TAB_LABELS = ['Vault', 'Editor', 'Snapshots', 'Sync', 'AI', 'Calendar'] as const

/**
 * Open the Settings dialog via the sidebar gear button.
 * Falls back to Ctrl+, keyboard shortcut.
 */
async function openSettings(page: import('@playwright/test').Page) {
  const settingsBtn = page.locator('[aria-label="Open settings"]')
  if (await settingsBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await settingsBtn.click()
  } else {
    await page.keyboard.press('Control+,')
  }
  // Wait for the Radix dialog to appear
  await page.waitForSelector('[role="dialog"]:has-text("Settings")', { timeout: 10_000 })
}

async function closeSettings(page: import('@playwright/test').Page) {
  const closeBtn = page.locator('[aria-label="Close settings"]')
  if (await closeBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await closeBtn.click()
  } else {
    // Try clicking the Done button
    await page.locator('button:has-text("Done")').click()
  }
  await page.waitForTimeout(500)
}

/* ------------------------------------------------------------------ */
/*  16.1 — Settings Behavior                                          */
/* ------------------------------------------------------------------ */

test.describe('16.1 — Settings Behavior', () => {
  test('16.1.1 Open settings — draft populated from config', async ({ vaultPage: page }) => {
    await openSettings(page)

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    // The Vault tab should be active by default and show the vault name input
    const vaultNameInput = dialog.locator('input[placeholder="My Vault"]')
    await expect(vaultNameInput).toBeVisible({ timeout: 5_000 })

    // The value should be pre-populated from the vault config
    const value = await vaultNameInput.inputValue()
    expect(value.length).toBeGreaterThan(0)
  })

  test('16.1.2 Change setting — auto-save after 600ms debounce', async ({ vaultPage: page }) => {
    await openSettings(page)

    const dialog = page.locator('[role="dialog"]')
    const vaultNameInput = dialog.locator('input[placeholder="My Vault"]')
    await expect(vaultNameInput).toBeVisible({ timeout: 5_000 })

    // Modify the vault name
    await vaultNameInput.clear()
    await vaultNameInput.fill('Renamed Vault E2E')

    // Wait for the 600ms debounce + save
    await page.waitForTimeout(1500)

    // The footer should show "Saved" after auto-save completes
    const footer = dialog.locator('text=Saved').or(dialog.locator('.text-green-500'))
    await expect(footer).toBeVisible({ timeout: 5_000 })
  })

  test('16.1.3 Ctrl+S in settings — immediate save', async ({ vaultPage: page }) => {
    await openSettings(page)

    const dialog = page.locator('[role="dialog"]')
    const vaultNameInput = dialog.locator('input[placeholder="My Vault"]')
    await expect(vaultNameInput).toBeVisible({ timeout: 5_000 })

    const originalName = await vaultNameInput.inputValue()

    // Modify the vault name
    await vaultNameInput.clear()
    await vaultNameInput.fill('Ctrl-S Test Vault')

    // Immediately Ctrl+S (no waiting for debounce)
    await page.keyboard.press('Control+s')

    // Footer should show saving then saved
    const savedIndicator = dialog.locator('text=Saved').or(dialog.locator('text=Saving'))
    await expect(savedIndicator).toBeVisible({ timeout: 5_000 })

    // Restore original name
    await vaultNameInput.clear()
    await vaultNameInput.fill(originalName || 'E2E Test Vault')
    await page.keyboard.press('Control+s')
    await page.waitForTimeout(1000)
  })

  test('16.1.4 Footer shows saving indicator', async ({ vaultPage: page }) => {
    await openSettings(page)

    const dialog = page.locator('[role="dialog"]')
    const vaultNameInput = dialog.locator('input[placeholder="My Vault"]')
    await expect(vaultNameInput).toBeVisible({ timeout: 5_000 })

    // Make a change to trigger save
    const original = await vaultNameInput.inputValue()
    await vaultNameInput.clear()
    await vaultNameInput.fill('Footer Test')

    // The footer area should eventually show either "Saving…" or "Saved"
    const footerStatus = dialog.locator('text=Saving').or(dialog.locator('text=Saved'))
    await expect(footerStatus).toBeVisible({ timeout: 5_000 })

    // Restore
    await vaultNameInput.clear()
    await vaultNameInput.fill(original || 'E2E Test Vault')
    await page.keyboard.press('Control+s')
    await page.waitForTimeout(1000)
  })

  test('16.1.5 Close and reopen — changes persisted', async ({ vaultPage: page }) => {
    await openSettings(page)

    const dialog = page.locator('[role="dialog"]')
    const vaultNameInput = dialog.locator('input[placeholder="My Vault"]')
    await expect(vaultNameInput).toBeVisible({ timeout: 5_000 })

    // Change the vault name
    const newName = `Persist-Test-${Date.now()}`
    await vaultNameInput.clear()
    await vaultNameInput.fill(newName)
    await page.keyboard.press('Control+s')
    await page.waitForTimeout(1500)

    // Close settings
    await closeSettings(page)

    // Reopen settings
    await openSettings(page)

    // The changed name should still be there
    const reopenedInput = page.locator('[role="dialog"] input[placeholder="My Vault"]')
    await expect(reopenedInput).toBeVisible({ timeout: 5_000 })
    const persisted = await reopenedInput.inputValue()
    expect(persisted).toBe(newName)

    // Restore original name
    await reopenedInput.clear()
    await reopenedInput.fill('E2E Test Vault')
    await page.keyboard.press('Control+s')
    await page.waitForTimeout(1000)
  })

  test('16.1.6 Switch tabs — state preserved', async ({ vaultPage: page }) => {
    await openSettings(page)

    const dialog = page.locator('[role="dialog"]')
    const vaultNameInput = dialog.locator('input[placeholder="My Vault"]')
    await expect(vaultNameInput).toBeVisible({ timeout: 5_000 })

    // Modify vault name on the Vault tab
    const original = await vaultNameInput.inputValue()
    await vaultNameInput.clear()
    await vaultNameInput.fill('Tab-Switch-Test')

    // Switch to the Editor tab
    await dialog.getByRole('tab', { name: 'Editor' }).click()
    await page.waitForTimeout(300)

    // Switch back to the Vault tab
    await dialog.getByRole('tab', { name: 'Vault' }).click()
    await page.waitForTimeout(300)

    // The modified name should be preserved
    const preserved = await vaultNameInput.inputValue()
    expect(preserved).toBe('Tab-Switch-Test')

    // Restore
    await vaultNameInput.clear()
    await vaultNameInput.fill(original || 'E2E Test Vault')
    await page.keyboard.press('Control+s')
    await page.waitForTimeout(1000)
  })

  test('16.1.7 All 6 tabs accessible: Vault, Editor, Snapshots, Sync, AI, Calendar', async ({
    vaultPage: page,
  }) => {
    await openSettings(page)

    const dialog = page.locator('[role="dialog"]')

    for (const label of SETTINGS_TAB_LABELS) {
      const tab = dialog.getByRole('tab', { name: label })
      await expect(tab).toBeVisible({ timeout: 5_000 })

      // Click the tab and verify the content panel changes
      await tab.click()
      await page.waitForTimeout(300)

      // The active tab should have the accent styling
      await expect(tab).toHaveClass(/border-accent|text-accent/, { timeout: 3_000 })
    }
  })
})
