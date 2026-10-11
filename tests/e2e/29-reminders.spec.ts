import { test, expect, navigateTo, writeVaultFile } from './fixtures'

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

test.describe('29 — Reminders: data', () => {
  test('29.1 A weekly event shows every week, and an occurrence opens the series', async ({
    vaultPage: page,
  }) => {
    // First of this month, weekly: four or five occurrences in the month view.
    const now = new Date()
    const first = new Date(now.getFullYear(), now.getMonth(), 1)
    await writeVaultFile(
      page,
      '_mentis/_calendar/evt-gym.md',
      [
        '---',
        'uid: gym',
        `start: ${ymd(first)}T07:00`,
        `end: ${ymd(first)}T08:00`,
        'allDay: false',
        'color: violet',
        'repeat: weekly',
        'alert: 15',
        '---',
        '',
        '# Gym',
        '',
      ].join('\n'),
    )
    await navigateTo(page, 'calendar')
    await page
      .locator('button', { hasText: /^month$/i })
      .first()
      .click()

    const occurrences = page.getByText('Gym', { exact: true })
    await expect(occurrences.first()).toBeVisible({ timeout: 10_000 })
    expect(await occurrences.count()).toBeGreaterThanOrEqual(4)

    // A later occurrence opens the series, whose start is the first one.
    await occurrences.nth(2).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByPlaceholder('Event title')).toHaveValue('Gym')
    await expect(dialog.locator('input[type="date"]').first()).toHaveValue(ymd(first))
  })

  test('29.2 A time in a captured task becomes its reminder', async ({ vaultPage: page }) => {
    await navigateTo(page, 'tasks')
    const bar = page.getByPlaceholder('Add a task...')
    await bar.fill('Call mum tomorrow 9am')
    await expect(page.getByText('Remind 09:00')).toBeVisible({ timeout: 10_000 })
    await bar.press('Enter')

    await page.getByText('Call mum', { exact: true }).click()
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    await expect(page.getByLabel('Remind')).toHaveValue(`${ymd(tomorrow)}T09:00`)
  })
})
