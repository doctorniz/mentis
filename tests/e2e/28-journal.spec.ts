import type { Page } from '@playwright/test'
import { test, expect, readVaultFile, writeVaultFile } from './fixtures'

const isoDay = (offset: number) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const longDate = (d: Date) =>
  d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

async function openToday(page: Page) {
  await page
    .getByRole('navigation', { name: 'Main views' })
    .getByRole('button', { name: /^Today, / })
    .first()
    .click()
  await expect(page.getByRole('heading', { name: longDate(new Date()) })).toBeVisible({
    timeout: 10_000,
  })
}

async function write(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Journal entry' }).click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(text)
  await page.waitForTimeout(900) // the view saves half a second after typing stops
}

async function chooseJournalTemplate(page: Page, name: string) {
  await page.keyboard.press('Control+,')
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('tab', { name: 'Editor' }).click()
  await dialog.getByLabel('Journal template').selectOption({ label: name })
  await expect(dialog.getByText(/New days get the tabs/)).toBeVisible({ timeout: 5_000 })
  await dialog.getByRole('button', { name: 'Done' }).click()
}

test.describe('28 — Journal', () => {
  test('28.1 Today opens as a journal; what is written is in the day’s note', async ({
    vaultPage: page,
  }) => {
    await openToday(page)
    await expect(page.getByRole('tab', { name: 'Notes' })).toHaveAttribute('aria-selected', 'true')
    await write(page, 'A quiet morning.')

    await page.getByRole('button', { name: 'Open as note' }).click()
    await expect(page.locator('.tiptap').first()).toContainText('A quiet morning.', {
      timeout: 10_000,
    })
  })

  test('28.2 A journal template gives new days its tabs and text, with variables filled', async ({
    vaultPage: page,
  }) => {
    await writeVaultFile(
      page,
      '_mentis/templates/Day.md',
      '---\ndefaultTab: Work\n---\n## Morning\n\n## Work\n\nPlan for {{weekday}}\n',
    )
    await chooseJournalTemplate(page, 'Day')
    await openToday(page)

    await expect(page.getByRole('tab')).toHaveText(['Morning', 'Work'])
    await expect(page.getByRole('tab', { name: 'Work' })).toHaveAttribute('aria-selected', 'true')
    const weekday = new Date().toLocaleDateString('en-US', { weekday: 'long' })
    const entry = page.getByRole('textbox', { name: 'Journal entry' })
    await expect(entry).toContainText(`Plan for ${weekday}`)

    await write(page, ' — ship the journal')
    await page.getByRole('tab', { name: 'Morning' }).click()
    await write(page, 'Coffee first')

    await page.getByRole('button', { name: 'Open as note' }).click()
    const note = page.locator('.tiptap').first()
    await expect(note).toContainText('Coffee first', { timeout: 10_000 })
    await expect(note).toContainText(`Plan for ${weekday} — ship the journal`)
  })

  test('28.3 Moves between days, and adds a tab', async ({ vaultPage: page }) => {
    await openToday(page)
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    await page.getByRole('button', { name: 'Previous day' }).click()
    await expect(page.getByRole('heading', { name: longDate(yesterday) })).toBeVisible()
    await page.getByRole('button', { name: 'Today', exact: true }).click()
    await expect(page.getByRole('heading', { name: longDate(new Date()) })).toBeVisible()

    await page.getByRole('button', { name: 'Add a tab' }).click()
    const name = page.getByLabel('New tab name')
    await name.fill('Gratitude')
    await name.press('Enter')
    await expect(page.getByRole('tab', { name: 'Gratitude' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  test('28.4 A day open as a note tab closes, and is edited in the journal', async ({
    vaultPage: page,
  }) => {
    await openToday(page)
    await write(page, 'Draft')
    await page.getByRole('button', { name: 'Open as note' }).click()
    const note = page.locator('.tiptap').first()
    await expect(note).toContainText('Draft', { timeout: 10_000 })
    await note.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' from the note')

    await openToday(page)
    const entry = page.getByRole('textbox', { name: 'Journal entry' })
    await expect(entry).toHaveAttribute('contenteditable', 'true')
    await expect(entry).toContainText('Draft from the note', { timeout: 10_000 })
    await expect(page.getByText('open in a note tab')).toHaveCount(0)
  })

  test('28.5 Shows the tasks due that day, and today the overdue ones', async ({
    vaultPage: page,
  }) => {
    await writeVaultFile(
      page,
      'Inbox.md',
      `- [ ] Pay rent >${isoDay(0)}\n- [ ] Send the form >${isoDay(-1)}\n- [ ] Book flights >${isoDay(1)}\n`,
    )
    await writeVaultFile(page, `Journal/${isoDay(0)}.md`, `- [ ] Water plants >${isoDay(0)}\n`)
    // Files written behind the app's back are indexed when the vault opens.
    await page.reload()
    await page.waitForSelector('[data-testid="main-sidebar"]:visible, nav:visible', {
      timeout: 30_000,
    })
    await openToday(page)

    const due = page.getByRole('region', { name: 'Due' })
    await expect(due.getByRole('button', { name: /Due · 3/ })).toBeVisible({ timeout: 10_000 })
    await expect(due.getByText('Pay rent')).toBeVisible()
    await expect(due.getByText('Send the form')).toBeVisible()
    await expect(due.getByText('Book flights')).toHaveCount(0)

    // Yesterday shows only its own.
    await page.getByRole('button', { name: 'Previous day' }).click()
    await expect(due.getByRole('button', { name: /Due · 1/ })).toBeVisible()
    await expect(due.getByText('Send the form')).toBeVisible()
    await page.getByRole('button', { name: 'Today', exact: true }).click()

    // Ticked here, it is done in its note and leaves the list.
    await due
      .locator('div[role="button"]', { hasText: 'Pay rent' })
      .getByRole('button', { name: 'Mark complete' })
      .click()
    await expect.poll(() => readVaultFile(page, 'Inbox.md')).toContain('- [x] Pay rent')
    await expect(due.getByText('Pay rent')).toHaveCount(0)

    // A task in the day's own journal: the page below shows it ticked.
    await due
      .locator('div[role="button"]', { hasText: 'Water plants' })
      .getByRole('button', { name: 'Mark complete' })
      .click()
    await expect
      .poll(() => readVaultFile(page, `Journal/${isoDay(0)}.md`))
      .toContain('- [x] Water plants')
    await expect(
      page.getByRole('textbox', { name: 'Journal entry' }).locator('li[data-checked="true"]'),
    ).toHaveCount(1)
  })
})
