import { test, expect, openVaultFile, writeVaultFile } from './fixtures'

const DECK = '---\nmarp: true\n---\n\n# One\n\n---\n\n# Two\n'

test.describe('23 — Slides', () => {
  test('23.1 Opening a deck renders one slide per section', async ({ vaultPage: page }) => {
    await writeVaultFile(page, 'Quarterly.slides.md', DECK)
    await openVaultFile(page, 'Quarterly.slides.md')

    const slides = page.getByTestId('slides-preview').locator('svg[data-marpit-svg]')
    await expect(slides).toHaveCount(2, { timeout: 15_000 })
    await expect(
      page.getByTestId('slides-preview').getByRole('heading', { name: 'Two' }),
    ).toBeVisible()
  })

  test('23.2 Typing a new slide separator updates the preview', async ({ vaultPage: page }) => {
    await writeVaultFile(page, 'Quarterly.slides.md', DECK)
    await openVaultFile(page, 'Quarterly.slides.md')

    const slides = page.getByTestId('slides-preview').locator('svg[data-marpit-svg]')
    await expect(slides).toHaveCount(2, { timeout: 15_000 })

    const source = page.locator('[aria-label="Slide source"] .cm-content')
    await source.click()
    await page.keyboard.press('Control+End')
    await page.keyboard.insertText('\n---\n\n# Three\n')

    await expect(slides).toHaveCount(3, { timeout: 10_000 })
  })

  test('23.3 Rendering runs in a worker', async ({ vaultPage: page }) => {
    await writeVaultFile(page, 'Quarterly.slides.md', DECK)
    await openVaultFile(page, 'Quarterly.slides.md')
    await expect(page.getByTestId('slides-preview').locator('svg[data-marpit-svg]')).toHaveCount(
      2,
      { timeout: 15_000 },
    )
    expect(page.workers().some((w) => w.url().includes('slides-worker'))).toBe(true)
  })
})
