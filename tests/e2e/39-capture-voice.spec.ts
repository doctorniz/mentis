import { test, expect, navigateTo } from './fixtures'

type Page = import('@playwright/test').Page

/**
 * The capture bar's mic records in place of the bar, then saves a voice
 * thought and opens Thoughts with it highlighted. Chrome's fake microphone
 * stands in for a real one.
 */
test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: [
      '--enable-features=SharedArrayBuffer',
      '--enable-experimental-web-platform-features',
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  },
})

const mic = (page: Page) => page.getByRole('button', { name: 'Record a voice thought' })
const done = (page: Page) => page.getByRole('button', { name: 'Stop and save' })
const highlighted = (page: Page) => page.locator('[data-highlighted]')

test.describe('39 — Voice from the capture bar', () => {
  test('39.1 The mic records in place of the bar and highlights the new voice note', async ({
    vaultPage: page,
  }) => {
    await navigateTo(page, 'board')
    const bar = page.getByRole('textbox', { name: 'Capture' })
    await mic(page).click()

    // The recorder stands where the bar was.
    await expect(done(page)).toBeVisible()
    await expect(bar).toBeHidden()
    await page.waitForTimeout(1200)
    await done(page).click()

    await expect(highlighted(page)).toBeVisible({ timeout: 10_000 })
    await expect(highlighted(page).getByText('Voice Note', { exact: true })).toBeVisible()
    await expect(bar).toBeVisible()
    // The mark is brief.
    await expect(highlighted(page)).toHaveCount(0, { timeout: 5_000 })
  })

  test('39.2 Cancel brings the bar back and saves nothing', async ({ vaultPage: page }) => {
    await navigateTo(page, 'board')
    await mic(page).click()
    await page.getByRole('button', { name: 'Cancel recording' }).click()
    await expect(page.getByRole('textbox', { name: 'Capture' })).toBeVisible()
    await expect(page.getByText('Voice Note', { exact: true })).toHaveCount(0)
  })

  test('39.3 From the phone’s Capture sheet: Done closes it and opens Thoughts', async ({
    vaultPage: page,
  }) => {
    await page.setViewportSize({ width: 393, height: 851 })
    const tabBar = page.getByTestId('mobile-tab-bar')
    // From Notes the sheet starts on Thoughts, where the mic is.
    await tabBar.getByRole('button', { name: 'Notes', exact: true }).click()
    await tabBar.getByRole('button', { name: 'Capture', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'Capture' })
    await mic(page).click()
    await expect(sheet.getByRole('button', { name: 'Stop and save' })).toBeVisible()
    await page.waitForTimeout(1200)
    await done(page).click()

    await expect(sheet).toBeHidden()
    await expect(highlighted(page)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('heading', { name: 'Thoughts', level: 1 })).toBeVisible()
  })
})
