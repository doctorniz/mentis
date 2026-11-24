import { test, expect, navigateTo } from './fixtures'

type Page = import('@playwright/test').Page

/** Capture on a wide screen: the button in the bottom right opens the capture bar over the view. */

const fab = (page: Page) => page.getByRole('button', { name: 'Capture', exact: true })
const panel = (page: Page) => page.getByRole('dialog', { name: 'Capture' })

test.describe('40 — Capture button', () => {
  test('40.1 Opens the capture bar over the view, and a thought saves', async ({
    vaultPage: page,
  }) => {
    await fab(page).click()
    const input = panel(page).getByRole('textbox', { name: 'Capture' })
    await expect(input).toBeFocused()
    await input.fill('Call the dentist')
    await input.press('Enter')
    await expect(panel(page)).toBeHidden()
    await expect(fab(page)).toBeVisible()

    await navigateTo(page, 'board')
    await expect(page.getByText('Call the dentist').first()).toBeVisible({ timeout: 10_000 })
  })

  test('40.2 Starts on the view’s destination; Esc closes it', async ({ vaultPage: page }) => {
    await navigateTo(page, 'tasks')
    await fab(page).click()
    await expect(
      panel(page).getByRole('button', { name: 'Capturing to Task; remove' }),
    ).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(panel(page)).toBeHidden()
  })

  test('40.3 Not in Thoughts, where the bar is docked, nor on a phone', async ({
    vaultPage: page,
  }) => {
    await expect(fab(page)).toBeVisible()
    await navigateTo(page, 'board')
    await expect(fab(page)).toHaveCount(0)

    await navigateTo(page, 'tasks')
    await page.setViewportSize({ width: 393, height: 851 })
    // The tab bar's Capture is the only one.
    await expect(fab(page)).toHaveCount(1)
    await expect(
      page.getByTestId('mobile-tab-bar').getByRole('button', { name: 'Capture' }),
    ).toBeVisible()
  })
})
