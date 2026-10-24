import { test, expect, navigateTo, writeVaultFile } from './fixtures'

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const local = (d: Date) => `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`

const taskFile = (title: string, remind: string) =>
  [
    '---',
    'uid: r1',
    'status: todo',
    'priority: 3',
    `remind: ${remind}`,
    '---',
    '',
    `# ${title}`,
    '',
  ].join('\n')

/** A vault file's text, read straight from OPFS; '' while the app is writing
 *  it (OPFS refuses the read), so `expect.poll` tries again. */
async function readVaultFile(page: import('@playwright/test').Page, relPath: string) {
  return page.evaluate(async (relPath) => {
    try {
      const root = await navigator.storage.getDirectory()
      const vaults = await root.getDirectoryHandle('vaults')
      const iter = (vaults as unknown as { values(): AsyncIterable<FileSystemHandle> }).values()
      let dir: FileSystemDirectoryHandle | null = null
      for await (const e of iter) if (e.kind === 'directory') dir = e as FileSystemDirectoryHandle
      const parts = relPath.split('/')
      const name = parts.pop()!
      for (const part of parts) dir = await dir!.getDirectoryHandle(part)
      return await (await (await dir!.getFileHandle(name)).getFile()).text()
    } catch {
      return ''
    }
  }, relPath)
}

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

test.describe('29 — Reminders: delivery', () => {
  test('29.3 A reminder falling due shows a card, and Snooze writes to the task', async ({
    vaultPage: page,
  }) => {
    test.setTimeout(150_000)
    // The next whole minute: reminders are kept to the minute.
    const at = new Date()
    at.setSeconds(0, 0)
    at.setMinutes(at.getMinutes() + 1)
    await writeVaultFile(page, '_mentis/_tasks/soon.md', taskFile('Water plants', local(at)))

    const card = page.getByRole('alert').filter({ hasText: 'Water plants' })
    await expect(card).toBeVisible({ timeout: 100_000 })
    await card.getByRole('button', { name: 'Snooze' }).click()
    await page.getByRole('menuitem', { name: '10 minutes' }).click()
    await expect(card).toBeHidden()
    await expect
      .poll(() => readVaultFile(page, '_mentis/_tasks/soon.md'), { timeout: 10_000 })
      .toMatch(/snoozeUntil: '?\d{4}-\d\d-\d\dT\d\d:\d\d/)
  })

  test('29.4 Reminders that fell due while closed are offered once, together', async ({
    vaultPage: page,
  }) => {
    const past = new Date(Date.now() - 30 * 60_000)
    await writeVaultFile(page, '_mentis/_tasks/past.md', taskFile('Take pills', local(past)))
    // The app last looked an hour ago.
    await page.evaluate(
      (seen) => {
        for (const key of Object.keys(localStorage))
          if (key.startsWith('mentis.reminders.seen:')) localStorage.setItem(key, String(seen))
      },
      Date.now() - 60 * 60_000,
    )
    await page.reload()
    await page.waitForSelector('aside, nav', { timeout: 30_000 })

    const summary = page.getByRole('alert').filter({ hasText: 'You missed 1 reminder' })
    await expect(summary).toBeVisible({ timeout: 20_000 })
    await summary.getByRole('button', { name: /You missed/ }).click()
    await expect(summary.getByText('Take pills')).toBeVisible()
    await summary.getByRole('button', { name: 'Done all' }).click()
    await expect(summary).toBeHidden()
    await expect
      .poll(() => readVaultFile(page, '_mentis/_tasks/past.md'), { timeout: 10_000 })
      .toMatch(/reminderAck: /)

    // Offered once: the next launch has nothing missed.
    await page.reload()
    await page.waitForSelector('aside, nav', { timeout: 30_000 })
    await page.waitForTimeout(4000)
    await expect(page.getByText(/You missed/)).toBeHidden()
  })
})

test.describe('29 — Reminders: tab', () => {
  const openRemindersTab = async (page: import('@playwright/test').Page) => {
    await page.keyboard.press('Control+3')
    await page
      .getByRole('button', { name: /^Reminders/ })
      .first()
      .click()
  }

  test('29.5 The tab lists missed and upcoming reminders; Done clears the missed one', async ({
    vaultPage: page,
  }) => {
    const past = new Date(Date.now() - 30 * 60_000)
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(10, 0, 0, 0)
    await writeVaultFile(page, '_mentis/_tasks/late.md', taskFile('Renew passport', local(past)))
    await writeVaultFile(page, '_mentis/_tasks/next.md', taskFile('Book flights', local(tomorrow)))
    await openRemindersTab(page)

    const missed = page.getByRole('region', { name: 'Missed' })
    await expect(missed.getByText('Renew passport')).toBeVisible({ timeout: 15_000 })
    await expect(
      page.getByRole('region', { name: 'Tomorrow' }).getByText('Book flights'),
    ).toBeVisible()
    await expect(page.getByLabel('1 missed')).toBeVisible()

    await missed.getByRole('button', { name: 'Done' }).click()
    await expect(missed).toBeHidden()
    await expect(page.getByLabel('1 missed')).toBeHidden({ timeout: 10_000 })
    await expect
      .poll(() => readVaultFile(page, '_mentis/_tasks/late.md'), { timeout: 10_000 })
      .toMatch(/reminderAck: /)
  })

  test('29.6 The evening prompt shows until the day has a journal', async ({ vaultPage: page }) => {
    await page.keyboard.press('Control+,')
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('tab', { name: 'Editor' }).click()
    await dialog
      .locator('div.flex.items-start', { hasText: 'Evening prompt' })
      .getByRole('switch')
      .click()
    // A time already past today, so the prompt is due at once.
    await dialog.getByLabel('Evening prompt time').fill('00:00')
    await dialog.getByRole('button', { name: 'Done' }).click()

    await openRemindersTab(page)
    const prompt = page.getByText('Write today’s journal')
    await expect(prompt).toBeVisible({ timeout: 15_000 })

    await writeVaultFile(page, `Journal/${ymd(new Date())}.md`, '# Today\n\nWritten.\n')
    await expect(prompt).toBeHidden({ timeout: 15_000 })
  })
})
