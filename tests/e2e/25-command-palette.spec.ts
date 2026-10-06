import type { Page } from '@playwright/test'
import { test, expect, navigateTo, createMarkdownNote, writeVaultFile } from './fixtures'

const palette = (page: Page) => page.getByRole('dialog', { name: 'Command palette' })
const paletteInput = (page: Page) =>
  palette(page).getByRole('textbox', { name: 'Command or file name' })

async function openPalette(page: Page) {
  await page.keyboard.press('Control+k')
  await expect(paletteInput(page)).toBeFocused({ timeout: 10_000 })
}

test.describe('25 — Command palette', () => {
  test('25.1 Ctrl+K opens it; Escape closes it; Ctrl+K toggles', async ({ vaultPage: page }) => {
    await openPalette(page)
    await page.keyboard.press('Escape')
    await expect(palette(page)).toBeHidden()

    await openPalette(page)
    await page.keyboard.press('Control+k')
    await expect(palette(page)).toBeHidden()
  })

  test('25.2 Runs a global command', async ({ vaultPage: page }) => {
    await openPalette(page)
    await paletteInput(page).fill('open settings')
    await expect(palette(page).getByRole('option', { name: /Open settings/ })).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(palette(page)).toBeHidden()
    await expect(page.getByRole('dialog').getByText('Settings', { exact: true })).toBeVisible({
      timeout: 10_000,
    })
  })

  test('25.3 Lists editor commands only when opened from a focused note', async ({
    vaultPage: page,
  }) => {
    await openPalette(page)
    await paletteInput(page).fill('heading 1')
    await expect(palette(page).getByText('No matches')).toBeVisible()
    await page.keyboard.press('Escape')

    await createMarkdownNote(page, 'Make me a heading')
    const editor = page.locator('.tiptap').first()
    await editor.click()
    await openPalette(page)
    await paletteInput(page).fill('heading 1')
    await expect(palette(page).getByRole('option', { name: /Heading 1/ })).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(palette(page)).toBeHidden()
    await expect(editor.locator('h1', { hasText: 'Make me a heading' })).toBeVisible({
      timeout: 5_000,
    })
  })

  test('25.4 Opens a file by name', async ({ vaultPage: page }) => {
    await writeVaultFile(page, 'Projects/Palette Target.md', '# Palette Target\n\nFound it.\n')
    await navigateTo(page, 'board')

    // The palette reads names from the index, which picks the file up in the background.
    await expect(async () => {
      await openPalette(page)
      await paletteInput(page).fill('palette tar')
      await expect(palette(page).getByRole('option', { name: /Palette Target/ })).toBeVisible({
        timeout: 1_000,
      })
    }).toPass({ timeout: 20_000 })

    await page.keyboard.press('Enter')
    await expect(palette(page)).toBeHidden()
    await expect(page.locator('.tiptap').first()).toContainText('Found it.', { timeout: 10_000 })
  })
})
