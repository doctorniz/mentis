import type { Page } from '@playwright/test'
import { test, expect, navigateTo } from './fixtures'

const bar = (page: Page) => page.getByRole('textbox', { name: 'Capture' })

function localDate(offsetDays: number) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

test.describe('26 — Capture', () => {
  test('26.1 A bare thought commits instantly and can be undone', async ({ vaultPage: page }) => {
    await navigateTo(page, 'board')
    await expect(page.getByRole('heading', { name: 'Capture' })).toBeVisible()

    await bar(page).fill('An idea worth keeping')
    await bar(page).press('Enter')

    await expect(bar(page)).toHaveValue('')
    await expect(page.getByRole('status')).toContainText('Saved to Thoughts')
    const card = page.getByText('An idea worth keeping')
    await expect(card).toBeVisible({ timeout: 5_000 })

    await page.getByRole('status').getByRole('button', { name: 'Undo' }).click()
    await expect(card).toBeHidden({ timeout: 5_000 })
  })

  test('26.2 The tasks bar escapes to Thoughts with /', async ({ vaultPage: page }) => {
    await navigateTo(page, 'tasks')
    const tasksBar = page.getByPlaceholder('Add a task...')

    await tasksBar.fill('/')
    const picker = page.getByRole('listbox', { name: 'Destinations' })
    await expect(picker.getByRole('option', { name: /Thought/ })).toBeVisible()
    await expect(picker.getByRole('option', { name: /Task/ })).toBeVisible()

    await tasksBar.fill('/thought ')
    await expect(page.getByRole('button', { name: /Capturing to Thought/ })).toBeVisible()
    await tasksBar.fill('Not a task')
    await tasksBar.press('Enter')
    await expect(page.getByRole('status')).toContainText('Saved to Thoughts')

    await navigateTo(page, 'board')
    await expect(page.getByText('Not a task')).toBeVisible({ timeout: 5_000 })
  })

  test('26.3 A natural date sets the task due date', async ({ vaultPage: page }) => {
    await navigateTo(page, 'tasks')
    const tasksBar = page.getByPlaceholder('Add a task...')
    await tasksBar.fill('Call mum tomorrow')
    // The date chip appears once the natural-date parser has loaded.
    await expect(page.getByText(localDate(1), { exact: true })).toBeVisible({ timeout: 10_000 })
    await tasksBar.press('Enter')
    await expect(page.getByText('Call mum', { exact: true })).toBeVisible({ timeout: 5_000 })
  })

  test('26.4 > opens the command palette', async ({ vaultPage: page }) => {
    await navigateTo(page, 'board')
    await bar(page).fill('>settings')
    const palette = page.getByRole('dialog', { name: 'Command palette' })
    await expect(palette).toBeVisible()
    await expect(palette.getByRole('textbox')).toHaveValue('settings')
    // The bar behind the dialog is hidden while it is open.
    await page.keyboard.press('Escape')
    await expect(palette).toBeHidden()
    await expect(bar(page)).toHaveValue('')
  })

  test('26.5 /cal confirms with the parse highlighted, and blocks an end before the start', async ({
    vaultPage: page,
  }) => {
    await navigateTo(page, 'board')
    await bar(page).fill('/cal Dentist tomorrow at 7pm')
    await bar(page).press('Enter')

    const dialog = page.getByRole('dialog', { name: 'Calendar' })
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await expect(dialog.getByLabel('What was understood').locator('mark')).toHaveText(
      'tomorrow at 7pm',
    )
    await expect(dialog.getByLabel('Title')).toHaveValue('Dentist')
    await expect(dialog.getByLabel('Starts')).toHaveValue(`${localDate(1)}T19:00`)
    await expect(dialog.locator('[data-autofilled="start"]')).toBeVisible()

    await dialog.getByLabel('Ends').fill(`${localDate(1)}T18:00`)
    await expect(dialog.locator('[data-autofilled="start"]')).toBeVisible()
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog.getByRole('alert')).toHaveText('Ends must be after Starts')

    await dialog.getByLabel('Ends').fill(`${localDate(1)}T20:00`)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('status')).toContainText('Added to Calendar')
  })

  test('26.6 A pasted link goes straight to the bookmark dialog', async ({ vaultPage: page }) => {
    await navigateTo(page, 'board')
    await bar(page).fill('https://example.com/article')
    await bar(page).press('Enter')

    const dialog = page.getByRole('dialog', { name: 'Bookmark' })
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await expect(dialog.getByLabel('URL')).toHaveValue('https://example.com/article')
    await expect(dialog.getByLabel('Title')).not.toHaveValue('')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('status')).toContainText('Saved to Bookmarks')
  })

  test('26.7 Esc asks before discarding edits, and keeps what was typed', async ({
    vaultPage: page,
  }) => {
    await navigateTo(page, 'board')
    await bar(page).fill('/cal Team lunch friday 1pm')
    await bar(page).press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Calendar' })
    await expect(dialog).toBeVisible({ timeout: 10_000 })

    await dialog.getByLabel('Location').fill('Canteen')
    await page.keyboard.press('Escape')
    await expect(dialog.getByRole('alert')).toContainText('Discard your changes?')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(bar(page)).toHaveValue('Team lunch friday 1pm')
  })

  test('26.8 /note confirms, writes the note and offers to open it', async ({
    vaultPage: page,
  }) => {
    await navigateTo(page, 'board')
    await bar(page).fill('/note Kitchen ideas #home')
    await bar(page).press('Enter')

    const dialog = page.getByRole('dialog', { name: 'Note' })
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await expect(dialog.getByLabel('Title')).toHaveValue('Kitchen ideas')
    await expect(dialog.getByLabel('Tags')).toHaveValue('#home')
    await dialog.getByLabel('Body').fill('Open shelving')
    await dialog.getByRole('button', { name: 'Save' }).click()

    const status = page.getByRole('status')
    await expect(status).toContainText('Note created · Kitchen ideas')
    await status.getByRole('button', { name: 'Open' }).click()
    await expect(page.locator('.tiptap').first()).toContainText('Open shelving', {
      timeout: 10_000,
    })
  })

  test('26.9 /journal appends to the day', async ({ vaultPage: page }) => {
    await navigateTo(page, 'board')
    await bar(page).fill('/journal Long walk by the river')
    await bar(page).press('Enter')

    const dialog = page.getByRole('dialog', { name: 'Journal' })
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await expect(dialog.getByLabel('Date')).toHaveValue(localDate(0))
    await expect(dialog.getByLabel('Entry')).toHaveValue('Long walk by the river')
    await page.keyboard.press('Control+Enter')
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('status')).toContainText(`Added to Journal · ${localDate(0)}`)
  })

  test('26.10 /chat goes to vault chat; unconfigured, the message waits in the box', async ({
    vaultPage: page,
  }) => {
    await navigateTo(page, 'board')
    await bar(page).fill('/chat What did I decide about the kitchen?')
    await bar(page).press('Enter')
    // The box's placeholder depends on the provider's state, so find it by its place.
    await expect(page.locator('main textarea').first()).toHaveValue(
      // insertText ends with a newline.
      /^What did I decide about the kitchen\?\s*$/,
      { timeout: 10_000 },
    )
  })

  test('26.11 /list adds an item, creating the list when the name is new', async ({
    vaultPage: page,
  }) => {
    await navigateTo(page, 'board')
    await bar(page).fill('/list Oat milk')
    await bar(page).press('Enter')

    const dialog = page.getByRole('dialog', { name: 'List' })
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await expect(dialog.getByLabel('Item')).toHaveValue('Oat milk')
    await dialog.getByLabel('List').fill('Groceries')
    await expect(dialog.getByText('Creates “Groceries”')).toBeVisible()
    await dialog.getByLabel('Note').fill('2 cartons')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toContainText('Added to Groceries')

    // A second item goes to the same list, which the dialog now offers by default.
    await bar(page).fill('/list Bananas')
    await bar(page).press('Enter')
    await expect(dialog.getByLabel('List')).toHaveValue('Groceries')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toContainText('Added to Groceries')

    await page.keyboard.press('Control+3')
    await page.getByRole('button', { name: 'Lists', exact: true }).first().click()
    await page.getByRole('button', { name: /Groceries/ }).click()
    await expect(page.getByLabel('Item', { exact: true })).toHaveCount(2)
    await expect(page.getByText('2 cartons')).toBeVisible()
  })
})
