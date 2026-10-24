import { test, expect, navigateTo, waitForToast, writeVaultFile } from './fixtures'

/**
 * Thoughts live in an ordinary visible folder (`Thoughts/` by default),
 * one note per thought named by its time and first words, and the folder
 * can be moved in Settings › Editor.
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
})
