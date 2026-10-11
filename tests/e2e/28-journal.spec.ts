import type { Page } from '@playwright/test'
import { test, expect, writeVaultFile } from './fixtures'

const longDate = (d: Date) =>
  d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
const pillDate = (d: Date) =>
  d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

async function openToday(page: Page) {
  await page
    .getByRole('button', { name: pillDate(new Date()) })
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
    await page.getByRole('button', { name: 'Today' }).click()
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

  test('28.4 A day open as a note tab is read-only in the journal view', async ({
    vaultPage: page,
  }) => {
    await openToday(page)
    await write(page, 'Draft')
    await page.getByRole('button', { name: 'Open as note' }).click()
    await expect(page.locator('.tiptap').first()).toContainText('Draft', { timeout: 10_000 })

    await openToday(page)
    await expect(page.getByText('This day is open in a note tab')).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Journal entry' })).toHaveAttribute(
      'contenteditable',
      'false',
    )
  })
})
