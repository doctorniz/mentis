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
})
