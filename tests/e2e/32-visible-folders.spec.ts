import { test, expect, navigateTo, waitForToast, writeVaultFile } from './fixtures'

/**
 * Thoughts live in an ordinary visible folder (`Thoughts/` by default),
 * one note per thought named by its time and first words, and the folder
 * can be moved in Settings › Editor. Events live in `Calendar/`, one note
 * per event named by its day and title.
 */

type Page = import('@playwright/test').Page

/** Names in a vault folder, read straight from OPFS; null when it does not exist. */
async function listVaultDir(page: Page, relPath: string): Promise<string[] | null> {
  return page.evaluate(async (relPath) => {
    const root = await navigator.storage.getDirectory()
    const vaults = await root.getDirectoryHandle('vaults')
    const iter = (vaults as unknown as { values(): AsyncIterable<FileSystemHandle> }).values()
    let dir: FileSystemDirectoryHandle | null = null
    for await (const e of iter) if (e.kind === 'directory') dir = e as FileSystemDirectoryHandle
    try {
      for (const part of relPath.split('/')) dir = await dir!.getDirectoryHandle(part)
    } catch {
      return null
    }
    const names: string[] = []
    const entries = (dir as unknown as { keys(): AsyncIterable<string> }).keys()
    for await (const name of entries) names.push(name)
    return names.sort()
  }, relPath)
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

async function captureThought(page: Page, text: string) {
  await navigateTo(page, 'board')
  const input = page.getByRole('textbox', { name: 'Capture' }).first()
  await input.fill(text)
  await input.press('Enter')
  await expect(page.locator('.break-inside-avoid').filter({ hasText: text })).toBeVisible()
}

async function moveThoughtsTo(page: Page, folder: string) {
  await page.keyboard.press('Control+,')
  const dialog = page.locator('[role="dialog"]:has-text("Settings")')
  await dialog.getByRole('tab', { name: 'Editor' }).click()
  await dialog.getByRole('textbox', { name: 'Thoughts folder' }).fill(folder)
  await dialog.getByRole('button', { name: 'Move' }).first().click()
}

test.describe('32 — Visible folders', () => {
  test('32.1 A captured thought is a note in Thoughts/, named by time and first words', async ({
    vaultPage: page,
  }) => {
    await captureThought(page, 'Call the bank about rates')
    await expect
      .poll(() => listVaultDir(page, 'Thoughts'))
      .toEqual([expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{4} Call the bank about rates\.md$/)])
  })

  test('32.2 Moving the Thoughts folder keeps every thought on the board', async ({
    vaultPage: page,
  }) => {
    await captureThought(page, 'Buy seeds')
    await moveThoughtsTo(page, 'Ideas')
    await waitForToast(page, 'Thoughts folder is now Ideas')

    expect(await listVaultDir(page, 'Ideas')).toEqual([expect.stringMatching(/ Buy seeds\.md$/)])
    expect(await listVaultDir(page, 'Thoughts')).toBeNull()

    await page.keyboard.press('Escape')
    await navigateTo(page, 'board')
    await expect(page.locator('.break-inside-avoid').filter({ hasText: 'Buy seeds' })).toBeVisible()
  })

  test('32.3 A folder that already holds notes is refused', async ({ vaultPage: page }) => {
    await captureThought(page, 'Stay put')
    await writeVaultFile(page, 'Projects/plan.md', '# Plan\n')
    await moveThoughtsTo(page, 'Projects')
    await waitForToast(page, /not empty/)

    expect(await listVaultDir(page, 'Projects')).toEqual(['plan.md'])
    expect(await listVaultDir(page, 'Thoughts')).toEqual([expect.stringMatching(/ Stay put\.md$/)])
  })

  test('32.4 An event is a note in Calendar/, renamed with its title; the tree opens the calendar', async ({
    vaultPage: page,
  }) => {
    await navigateTo(page, 'calendar')
    await page.locator('button', { hasText: 'New event' }).click()
    let dialog = page.getByRole('dialog')
    await dialog.getByPlaceholder('Event title').fill('Dentist')
    await dialog.getByRole('button', { name: 'Create' }).click()
    await expect
      .poll(() => listVaultDir(page, 'Calendar'))
      .toEqual([expect.stringMatching(/^\d{4}-\d{2}-\d{2} Dentist\.md$/)])

    await page.getByText('Dentist', { exact: true }).first().click()
    dialog = page.getByRole('dialog')
    await dialog.getByPlaceholder('Event title').fill('Orthodontist')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect
      .poll(() => listVaultDir(page, 'Calendar'))
      .toEqual([expect.stringMatching(/^\d{4}-\d{2}-\d{2} Orthodontist\.md$/)])

    // In the tree the folder has no children; it opens the calendar.
    await navigateTo(page, 'board')
    const folder = page.getByRole('treeitem').filter({ hasText: /^Calendar$/ })
    await expect(folder).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('treeitem').filter({ hasText: 'Orthodontist' })).toHaveCount(0)
    await folder.getByRole('button').click()
    await expect(page.locator('button', { hasText: 'New event' })).toBeVisible()
  })

  test('32.5 An event found in search opens in the calendar, not as a note', async ({
    vaultPage: page,
  }) => {
    const today = ymd(new Date())
    await writeVaultFile(
      page,
      `Calendar/${today} Kayak trip.md`,
      `---\nuid: kayak\nstart: ${today}\nend: ${today}\nallDay: true\ncolor: sky\n---\n\n# Kayak trip\n\nBring the zephyrine dry bag.\n`,
    )
    // Files written behind the app's back are indexed when the vault opens.
    await page.reload()
    await page.waitForSelector('[data-testid="main-sidebar"]:visible, nav:visible', {
      timeout: 30_000,
    })

    await navigateTo(page, 'search')
    await page.locator('input[aria-label="Search vault"]').first().fill('zephyrine')
    await page.getByText(/Kayak trip/).first().click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByPlaceholder('Event title')).toHaveValue('Kayak trip', {
      timeout: 10_000,
    })
    await expect(page.locator('.tiptap')).toHaveCount(0)
  })
})
