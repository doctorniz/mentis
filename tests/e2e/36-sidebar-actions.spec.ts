import { test, expect, navigateTo } from './fixtures'

/**
 * The sidebar's search bar is the one place to type a search; the New menu starts an event or
 * a task; and a click in the calendar starts an event at the hour clicked, or at 8am.
 */

type Page = import('@playwright/test').Page

const bar = (page: Page) => page.locator('input[aria-label="Search vault"]')
const tree = (page: Page) => page.getByRole('tree', { name: 'Vault file tree' })

test.describe('36 — Sidebar search and New', () => {
  test('36.1 Typing in the sidebar bar shows results under it, and clearing brings the tree back', async ({
    vaultPage: page,
  }) => {
    // One bar, not a bar that opens another.
    await expect(bar(page)).toHaveCount(1)
    await expect(tree(page)).toBeVisible()

    await bar(page).click()
    await bar(page).fill('qwertyzxcv')
    await expect(page.getByText('No matches')).toBeVisible({ timeout: 10_000 })
    await expect(tree(page)).toHaveCount(0)
    await expect(bar(page)).toHaveCount(1)

    await page.getByRole('button', { name: 'Clear search' }).click()
    await expect(tree(page)).toBeVisible()
    await expect(bar(page)).toHaveValue('')
  })

  test('36.2 Escape clears the search; Ctrl+F focuses the bar', async ({ vaultPage: page }) => {
    await bar(page).fill('qwertyzxcv')
    await expect(tree(page)).toHaveCount(0)
    await bar(page).press('Escape')
    await expect(bar(page)).toHaveValue('')
    await expect(tree(page)).toBeVisible()

    // Escape left the bar; focus is on no field, so Ctrl+F is the sidebar's, not a note's find bar.
    await expect(bar(page)).not.toBeFocused()
    await page.keyboard.press('Control+f')
    await expect(bar(page)).toBeFocused()
  })

  test('36.3 New › Event opens the calendar with a new event at 8am today', async ({
    vaultPage: page,
  }) => {
    await page.locator('aside').getByRole('button', { name: 'New', exact: true }).click()
    await page.locator('aside').getByRole('button', { name: 'Event', exact: true }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('New Event')).toBeVisible({ timeout: 10_000 })
    await expect(dialog.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    await expect(dialog.locator('input[type="time"]').nth(0)).toHaveValue('08:00')
    await expect(dialog.locator('input[type="time"]').nth(1)).toHaveValue('09:00')
  })

  test('36.4 New › Task opens Tasks with the add box ready', async ({ vaultPage: page }) => {
    await page.locator('aside').getByRole('button', { name: 'New', exact: true }).click()
    await page.locator('aside').getByRole('button', { name: 'Task', exact: true }).click()
    await expect(page.getByPlaceholder('Add a task...')).toBeFocused({ timeout: 10_000 })
  })
})

test.describe('36 — Calendar clicks', () => {
  /** A click in the first day column of the week view, `px` below the top of `hour`. */
  async function clickWeek(page: Page, hour: number, px: number, onHourLine: boolean) {
    await page.evaluate(
      ({ hour, px, onHourLine }) => {
        const column = document.querySelector<HTMLElement>(
          'div[role="button"][tabindex="0"][style*="height: 1536px"]',
        )
        if (!column) throw new Error('week column not found')
        const rect = column.getBoundingClientRect()
        // The hour lines are the column's first 24 children: the click lands on one of them.
        const target = onHourLine ? (column.children[hour] as HTMLElement) : column
        target.dispatchEvent(
          new MouseEvent('click', {
            bubbles: true,
            clientX: rect.left + 8,
            clientY: rect.top + hour * 64 + px,
          }),
        )
      },
      { hour, px, onHourLine },
    )
  }

  test('36.5 A click on an hour line in the week view starts the event at that hour', async ({
    vaultPage: page,
  }) => {
    await navigateTo(page, 'calendar')
    await page.getByRole('button', { name: 'week', exact: true }).click()
    await clickWeek(page, 14, 1, true)
    const dialog = page.getByRole('dialog')
    await expect(dialog.locator('input[type="time"]').nth(0)).toHaveValue('14:00', {
      timeout: 10_000,
    })
    await expect(dialog.locator('input[type="time"]').nth(1)).toHaveValue('15:00')
  })

  test('36.6 A click late in an hour starts the event in that hour, not the next', async ({
    vaultPage: page,
  }) => {
    await navigateTo(page, 'calendar')
    await page.getByRole('button', { name: 'week', exact: true }).click()
    await clickWeek(page, 10, 62, false)
    const dialog = page.getByRole('dialog')
    await expect(dialog.locator('input[type="time"]').nth(0)).toHaveValue('10:30', {
      timeout: 10_000,
    })
  })

  test('36.7 A click that names only a day (the toolbar, a month cell) starts at 8am', async ({
    vaultPage: page,
  }) => {
    await navigateTo(page, 'calendar')
    await page.getByRole('button', { name: 'New event' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.locator('input[type="time"]').nth(0)).toHaveValue('08:00', {
      timeout: 10_000,
    })
    await expect(dialog.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  })
})
