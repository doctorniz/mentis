import type { Page } from '@playwright/test'
import { test, expect, navigateTo, readVaultFile, waitForView } from './fixtures'

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Add a task through the Tasks view's bar and wait for its row. */
async function addTask(page: Page, text: string, shows: string) {
  const input = page.getByPlaceholder('Add a task...')
  await input.fill(text)
  await input.press('Enter')
  await expect(page.getByText(shows).first()).toBeVisible({ timeout: 10_000 })
}

/** A task's row in the list. */
const row = (page: Page, title: string) =>
  page.getByRole('main').locator('div[role="button"]', { hasText: title }).first()

test.describe('7 — Tasks', () => {
  test.beforeEach(async ({ vaultPage: page }) => {
    await waitForView(page, 'tasks')
  })

  // ─── 7.1 Quick-Add Parsing ──────────────────────────────────────────────────

  test.describe('7.1 Quick-Add Parsing', () => {
    test('7.1.1 "Buy milk !1 #grocery >today" parses priority, tag, due', async ({
      vaultPage: page,
    }) => {
      const input = page.getByPlaceholder('Add a task...')
      await input.fill('Buy milk !1 #grocery >today')

      await expect(page.getByText('Urgent')).toBeVisible({ timeout: 3_000 })
      await expect(page.getByText('#grocery')).toBeVisible()
      await expect(page.getByText(ymd(new Date()))).toBeVisible()

      await input.press('Enter')
      await expect(row(page, 'Buy milk')).toBeVisible({ timeout: 10_000 })
    })

    test('7.1.2 "Weekly standup every monday" sets repeat=weekly', async ({ vaultPage: page }) => {
      const input = page.getByPlaceholder('Add a task...')
      await input.fill('Weekly standup every monday')
      await expect(page.getByText('Weekly · Monday')).toBeVisible({ timeout: 3_000 })
      await input.press('Enter')
      await expect(row(page, 'Weekly standup')).toBeVisible({ timeout: 10_000 })
    })

    test('7.1.4 "Call dentist >tomorrow" sets due to tomorrow', async ({ vaultPage: page }) => {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const input = page.getByPlaceholder('Add a task...')
      await input.fill('Call dentist >tomorrow')
      await expect(page.getByText(ymd(tomorrow))).toBeVisible({ timeout: 3_000 })
      await input.press('Enter')
      await expect(row(page, 'Call dentist').getByText('Tomorrow')).toBeVisible({
        timeout: 10_000,
      })
    })

    test('7.1.9 priority only accepts 1–4', async ({ vaultPage: page }) => {
      const input = page.getByPlaceholder('Add a task...')
      await input.fill('Test task !2')
      await expect(page.getByText('High')).toBeVisible({ timeout: 3_000 })

      await input.clear()
      await input.fill('Test task !5')
      await page.waitForTimeout(500)
      await expect(page.getByText('Urgent')).not.toBeVisible()
      await expect(page.getByText('High')).not.toBeVisible()
      await expect(page.getByText('Low')).not.toBeVisible()
    })
  })

  // ─── 7.2 Checkbox lines ────────────────────────────────────────────────────

  test.describe('7.2 Tasks are lines in notes', () => {
    test('7.2.1 A new task is a checkbox line in Inbox.md', async ({ vaultPage: page }) => {
      await addTask(page, 'Pay rent !2 #home >tomorrow', 'Pay rent')
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      await expect
        .poll(() => readVaultFile(page, 'Inbox.md'), { timeout: 10_000 })
        .toContain(`- [ ] Pay rent #home >${ymd(tomorrow)} !2`)
    })

    test('7.2.2 By date sorts tasks under Overdue, Today, Next 7 days, Later, No date', async ({
      vaultPage: page,
    }) => {
      await addTask(page, 'Due today task >today', 'Due today task')
      await addTask(page, 'Someday task', 'Someday task')

      await expect(
        page.getByRole('region', { name: 'Today' }).getByText('Due today task'),
      ).toBeVisible()
      await expect(
        page.getByRole('region', { name: 'No date' }).getByText('Someday task'),
      ).toBeVisible()
    })

    test('7.2.3 A checkbox written in any note shows under that note', async ({
      vaultPage: page,
    }) => {
      await navigateTo(page, 'vault')
      await page.getByRole('button', { name: 'New note' }).first().click()
      const editor = page.locator('.tiptap').first()
      await expect(editor).toBeVisible({ timeout: 10_000 })
      await editor.click()
      await page.keyboard.type('[ ] Pick up parcel')
      // The note saves and is indexed; then Tasks has it.
      await page.waitForTimeout(2_500)

      await navigateTo(page, 'tasks')
      await page.getByRole('radio', { name: 'By note' }).click()
      await expect(
        page.getByRole('region', { name: 'Untitled' }).getByText('Pick up parcel'),
      ).toBeVisible({ timeout: 15_000 })
    })

    test('7.2.4 Ticking a checkbox in the note records the day', async ({ vaultPage: page }) => {
      await addTask(page, 'Water the ferns', 'Water the ferns')
      await row(page, 'Water the ferns').click()
      await page.getByRole('dialog').getByRole('button', { name: 'Open in Inbox' }).click()

      const item = page.locator('.tiptap li[data-checked]', { hasText: 'Water the ferns' })
      await expect(item).toBeVisible({ timeout: 10_000 })
      await item.locator('input[type="checkbox"]').check()
      await expect
        .poll(() => readVaultFile(page, 'Inbox.md'), { timeout: 10_000 })
        .toContain(`- [x] Water the ferns done:${ymd(new Date())}`)
    })
  })

  // ─── 7.3 Task Operations ───────────────────────────────────────────────────

  test.describe('7.3 Task Operations', () => {
    test('7.3.2 Ticking hides a task until Show done', async ({ vaultPage: page }) => {
      await addTask(page, 'Task to complete', 'Task to complete')
      await row(page, 'Task to complete').getByRole('button', { name: 'Mark complete' }).click()
      await expect(row(page, 'Task to complete')).toBeHidden()

      await page.getByRole('button', { name: /^Show done/ }).click()
      await expect(row(page, 'Task to complete').getByText('Task to complete')).toHaveClass(
        /line-through/,
      )
      await expect
        .poll(() => readVaultFile(page, 'Inbox.md'), { timeout: 10_000 })
        .toContain(`- [x] Task to complete done:${ymd(new Date())}`)
    })

    test('7.3.3 Unticking reopens it', async ({ vaultPage: page }) => {
      await addTask(page, 'Task to uncomplete', 'Task to uncomplete')
      await page
        .getByRole('button', { name: /^Show done|^Hide done/ })
        .waitFor({ state: 'detached' })
      await row(page, 'Task to uncomplete').getByRole('button', { name: 'Mark complete' }).click()
      await page.getByRole('button', { name: /^Show done/ }).click()
      await row(page, 'Task to uncomplete').getByRole('button', { name: 'Mark incomplete' }).click()
      await expect(row(page, 'Task to uncomplete').getByText('Task to uncomplete')).not.toHaveClass(
        /line-through/,
      )
      await expect
        .poll(() => readVaultFile(page, 'Inbox.md'), { timeout: 10_000 })
        .toContain('- [ ] Task to uncomplete')
    })

    test('7.3.4 Delete removes its line', async ({ vaultPage: page }) => {
      await addTask(page, 'Task to delete', 'Task to delete')
      const r = row(page, 'Task to delete')
      await r.hover()
      await r.getByRole('button', { name: 'Delete task' }).click()
      await expect(r).toBeHidden({ timeout: 5_000 })
      await expect
        .poll(() => readVaultFile(page, 'Inbox.md'), { timeout: 10_000 })
        .not.toContain('Task to delete')
    })

    test('7.3.5 The dialog edits the line, and adds subtasks under it', async ({
      vaultPage: page,
    }) => {
      await addTask(page, 'Plan trip', 'Plan trip')
      await row(page, 'Plan trip').click()
      const dialog = page.getByRole('dialog')
      await dialog.getByLabel('Due date').fill('2030-05-01')
      await dialog.getByLabel('Remind at').fill('08:30')
      await dialog.getByRole('button', { name: 'Low' }).click()
      await dialog.getByPlaceholder('Add subtask').fill('Book hotel')
      await dialog.getByPlaceholder('Add subtask').press('Enter')
      await expect(dialog.getByText('Book hotel')).toBeVisible()
      await dialog.getByRole('button', { name: 'Save' }).click()

      await expect
        .poll(() => readVaultFile(page, 'Inbox.md'), { timeout: 10_000 })
        .toContain('- [ ] Plan trip >2030-05-01 08:30 !4\n  - [ ] Book hotel')
    })
  })

  // ─── 7.4 Recurring Tasks ───────────────────────────────────────────────────

  test.describe('7.4 Recurring Tasks', () => {
    test('7.4.1 Ticking a weekly task adds the next one', async ({ vaultPage: page }) => {
      await addTask(page, 'Standup every monday', 'Standup')
      const first = await readVaultFile(page, 'Inbox.md')
      const due = /- \[ \] Standup >(\d{4}-\d\d-\d\d) every monday/.exec(first)?.[1]
      expect(due).toBeTruthy()

      await row(page, 'Standup').getByRole('button', { name: 'Mark complete' }).click()
      const next = new Date()
      next.setDate(next.getDate() + 1)
      while (next.getDay() !== 1) next.setDate(next.getDate() + 1)
      await expect
        .poll(() => readVaultFile(page, 'Inbox.md'), { timeout: 10_000 })
        .toContain(
          `- [ ] Standup >${ymd(next)} every monday\n- [x] Standup >${due} every monday done:${ymd(new Date())}`,
        )
      await expect(row(page, 'Standup')).toBeVisible()
    })
  })
})
