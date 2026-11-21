import { test, expect, navigateTo, waitForToast, enableChat } from './fixtures'

/**
 * The sidebar has one list of places: the file tree. Chat, Calendar, Tasks,
 * Thoughts and Bookmarks are its first rows, whether or not their folders
 * exist yet, and folders are made and renamed in the tree itself.
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

const tree = (page: Page) => page.getByRole('tree', { name: 'Vault file tree' })

test.describe('35 — Folders in the tree', () => {
  test('35.1 The pages are the first rows, once each, and the main nav lists none of them', async ({
    vaultPage: page,
  }) => {
    const t = tree(page)
    for (const name of ['Calendar', 'Tasks', 'Thoughts', 'Bookmarks']) {
      await expect(t.getByRole('button', { name, exact: true })).toHaveCount(1)
    }
    const nav = page.getByRole('navigation', { name: 'Main views' })
    await expect(nav.getByRole('button', { name: /^Today, / })).toBeVisible()
    await expect(
      nav.getByRole('button', { name: /^(Calendar|Tasks|Thoughts|Bookmarks)/ }),
    ).toHaveCount(0)

    // They come before the user's own folders.
    const labels = await t.getByRole('button').allTextContents()
    expect(labels.slice(0, 4)).toEqual(['Calendar', 'Tasks', 'Thoughts', 'Bookmarks'])
  })

  test('35.1b With chat on, the Chat row is the saved-chats folder: one row, not two', async ({
    vaultPage: page,
  }) => {
    await enableChat(page)
    const t = tree(page)
    await expect(t.getByRole('button', { name: 'Chat', exact: true })).toHaveCount(1)
    await expect(t.getByRole('button', { name: 'Expand Chat', exact: true })).toHaveCount(1)
    // Its name opens the page; its arrow only lists the chats.
    await expect(t.getByRole('button', { name: 'Calendar', exact: true })).toHaveCount(1)
    await t.getByRole('button', { name: 'Chat', exact: true }).click()
    await expect(page.locator('textarea').first()).toBeVisible({ timeout: 10_000 })
  })

  test('35.2 Thoughts is on disk only once something is saved in it', async ({
    vaultPage: page,
  }) => {
    expect(await listVaultDir(page, 'Thoughts')).toBeNull()
    await navigateTo(page, 'board')
    const input = page.getByRole('textbox', { name: 'Capture' }).first()
    await input.fill('First thought')
    await input.press('Enter')
    await expect(
      page.locator('.break-inside-avoid').filter({ hasText: 'First thought' }),
    ).toBeVisible()
    await expect.poll(() => listVaultDir(page, 'Thoughts')).not.toBeNull()
    await expect(tree(page).getByRole('button', { name: 'Thoughts', exact: true })).toHaveCount(1)
  })

  test('35.3 A new folder is named in the tree, with no dialog', async ({ vaultPage: page }) => {
    await page.getByRole('button', { name: 'New folder', exact: true }).first().click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const box = tree(page).getByRole('textbox', { name: 'Folder name' })
    await expect(box).toBeFocused()
    await box.fill('Projects')
    await box.press('Enter')

    await expect(tree(page).getByRole('button', { name: 'Expand Projects' })).toBeVisible()
    await expect(box).toHaveCount(0)
    expect(await listVaultDir(page, 'Projects')).toEqual([])
  })

  test('35.4 Escape drops a new folder that was never named', async ({ vaultPage: page }) => {
    await page.getByRole('button', { name: 'New folder', exact: true }).first().click()
    const box = tree(page).getByRole('textbox', { name: 'Folder name' })
    await box.fill('Nope')
    await box.press('Escape')
    await expect(box).toHaveCount(0)
    expect(await listVaultDir(page, 'Nope')).toBeNull()
  })

  test('35.5 A subfolder is named inside its parent', async ({ vaultPage: page }) => {
    await page.getByRole('button', { name: 'New folder', exact: true }).first().click()
    await tree(page).getByRole('textbox', { name: 'Folder name' }).fill('Work')
    await page.keyboard.press('Enter')
    await expect(tree(page).getByRole('button', { name: 'Expand Work' })).toBeVisible()

    await page.getByRole('button', { name: 'New subfolder in Work' }).click()
    const box = tree(page).getByRole('textbox', { name: 'Folder name' })
    await box.fill('Reports')
    await box.press('Enter')
    await expect.poll(() => listVaultDir(page, 'Work')).toEqual(['Reports'])
    await expect(tree(page).getByRole('button', { name: 'Expand Reports' })).toBeVisible()
  })

  test('35.6 A folder is renamed in its own row', async ({ vaultPage: page }) => {
    await page.getByRole('button', { name: 'New folder', exact: true }).first().click()
    await tree(page).getByRole('textbox', { name: 'Folder name' }).fill('Drafts')
    await page.keyboard.press('Enter')
    await expect(tree(page).getByRole('button', { name: 'Expand Drafts' })).toBeVisible()

    await page.getByRole('button', { name: 'Rename Drafts' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const box = tree(page).getByRole('textbox', { name: 'New folder name' })
    await expect(box).toHaveValue('Drafts')
    await box.fill('Finals')
    await box.press('Enter')

    await expect(tree(page).getByRole('button', { name: 'Expand Finals' })).toBeVisible()
    await expect(tree(page).getByRole('button', { name: 'Expand Drafts' })).toHaveCount(0)
    expect(await listVaultDir(page, 'Finals')).toEqual([])
    expect(await listVaultDir(page, 'Drafts')).toBeNull()
  })

  test('35.7 A name already in use is refused and the box stays open', async ({
    vaultPage: page,
  }) => {
    for (const name of ['One', 'Two']) {
      await page.getByRole('button', { name: 'New folder', exact: true }).first().click()
      await tree(page).getByRole('textbox', { name: 'Folder name' }).fill(name)
      await page.keyboard.press('Enter')
      await expect(tree(page).getByRole('button', { name: `Expand ${name}` })).toBeVisible()
    }

    await page.getByRole('button', { name: 'Rename Two' }).click()
    const box = tree(page).getByRole('textbox', { name: 'New folder name' })
    await box.fill('One')
    await box.press('Enter')
    await waitForToast(page, /already exists/)
    await expect(box).toBeVisible()
    await box.press('Escape')
    await expect(tree(page).getByRole('button', { name: 'Expand Two' })).toBeVisible()
  })
})
