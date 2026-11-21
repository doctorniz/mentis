import { test, expect, navigateTo, runCommand } from './fixtures'

type Page = import('@playwright/test').Page

const times = (page: Page) => page.getByRole('dialog').locator('input[type="time"]')

test.describe('38 — Calendar event times', () => {
  test('38.1 Moving the start past the end moves the end to an hour after it', async ({
    vaultPage: page,
  }) => {
    await navigateTo(page, 'calendar')
    await page.getByRole('button', { name: 'New event' }).click()
    await expect(times(page).nth(0)).toHaveValue('08:00')

    await times(page).nth(0).fill('09:30')
    await expect(times(page).nth(1)).toHaveValue('10:30')

    // An end that is still after the start is left alone.
    await times(page).nth(0).fill('08:00')
    await expect(times(page).nth(1)).toHaveValue('10:30')

    // An hour after 23:30 is the next day.
    await times(page).nth(0).fill('23:30')
    await expect(times(page).nth(1)).toHaveValue('00:30')
  })

  test('38.2 Opening an existing event does not focus a text field', async ({
    vaultPage: page,
  }) => {
    await navigateTo(page, 'calendar')
    await page.getByRole('button', { name: 'New event' }).click()
    const title = page.getByPlaceholder('Event title')
    await expect(title).toBeFocused()
    await title.fill('Dentist')
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await page.getByText('Dentist').first().click()
    await expect(page.getByRole('dialog').getByText('Edit Event')).toBeVisible()
    await expect(page.getByPlaceholder('Event title')).not.toBeFocused()
  })
})

test.describe('38 — Recording and start view', () => {
  test('38.3 A voice thought asked for from elsewhere opens Thoughts already recording', async ({
    vaultPage: page,
  }) => {
    await runCommand(page, 'Record a voice thought')
    // Recording (or, with no microphone here, the refusal): the bar is up without a second press.
    await expect(
      page
        .getByText(/Microphone access denied|Failed to process/)
        .or(page.getByRole('button', { name: /stop/i }))
        .first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('38.4 This device opens to the chosen page', async ({ vaultPage: page }) => {
    await page.evaluate(() => localStorage.setItem('mentis.startView', 'calendar'))
    await page.reload()
    await expect(page.getByRole('button', { name: 'New event' })).toBeVisible({ timeout: 20_000 })

    await page.evaluate(() => localStorage.setItem('mentis.startView', 'new-note'))
    await page.reload()
    await expect(page.locator('.tiptap').first()).toBeVisible({ timeout: 20_000 })
  })

  test('38.5 Settings offers Open to, kept on the device', async ({ vaultPage: page }) => {
    await page.keyboard.press('Control+,')
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    const select = dialog.getByLabel('Open to')
    await expect(select).toBeVisible({ timeout: 10_000 })
    await select.selectOption('tasks')
    expect(await page.evaluate(() => localStorage.getItem('mentis.startView'))).toBe('tasks')
  })
})

test.describe('38 — File tree', () => {
  test('38.6 A root note lines up with the folders above it', async ({ vaultPage: page }) => {
    const tree = page.getByRole('tree', { name: 'Vault file tree' })
    const iconX = async (row: ReturnType<Page['locator']>) =>
      Math.round((await row.locator('svg').first().boundingBox())!.x)
    const folder = tree.getByRole('button', { name: 'Calendar', exact: true }).first()
    await expect(folder).toBeVisible()
    const note = tree.getByRole('button', { name: 'Welcome', exact: true })
    await expect(note).toBeVisible({ timeout: 10_000 })
    expect(await iconX(note)).toBe(await iconX(folder))
  })
})
