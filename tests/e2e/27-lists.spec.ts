import type { Page } from '@playwright/test'
import { test, expect, navigateTo, openVaultFile, readVaultFile, writeVaultFile } from './fixtures'

async function openLists(page: Page) {
  await page.keyboard.press('Control+4')
  await page.getByRole('button', { name: 'Lists', exact: true }).first().click()
}

async function createList(page: Page, name: string, kind: 'Checklist' | 'Ordered') {
  await openLists(page)
  await page.getByLabel('Kind of new list').selectOption({ label: kind })
  const input = page.getByLabel('New list name')
  await input.fill(name)
  await input.press('Enter')
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible({ timeout: 10_000 })
}

async function addItems(page: Page, ...texts: string[]) {
  const add = page.getByLabel('Add an item')
  for (const t of texts) {
    await add.fill(t)
    await add.press('Enter')
  }
}

const itemTexts = (page: Page) =>
  page
    .getByLabel('Item', { exact: true })
    .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))

test.describe('27 — Lists', () => {
  test('27.1 A checklist: tick off, uncheck all, and it is kept', async ({ vaultPage: page }) => {
    await createList(page, 'Weekly shop', 'Checklist')
    await addItems(page, 'Milk', 'Bread', 'Eggs')
    await page.getByLabel('Done: Bread').check()
    await page.getByLabel('Done: Eggs').check()

    await page.getByRole('button', { name: 'All lists' }).click()
    await expect(page.getByText('2 of 3 done')).toBeVisible({ timeout: 5_000 })

    await page.getByRole('button', { name: /Weekly shop/ }).click()
    await expect(page.getByLabel('Done: Bread')).toBeChecked()
    await page.getByRole('button', { name: 'Uncheck all' }).click()
    await expect(page.getByLabel('Done: Bread')).not.toBeChecked()
    await expect(page.getByLabel('Done: Eggs')).not.toBeChecked()
  })

  test('27.2 Scheduled reset is saved with the list', async ({ vaultPage: page }) => {
    await createList(page, 'Morning routine', 'Checklist')
    await page.getByLabel('Reset').selectOption({ label: 'Resets daily' })
    await page.getByRole('button', { name: 'All lists' }).click()
    await expect(page.getByText('Resets daily')).toBeVisible({ timeout: 5_000 })
  })

  test('27.3 An ordered list numbers its steps, highlights the next and reorders', async ({
    vaultPage: page,
  }) => {
    await createList(page, 'Bake bread', 'Ordered')
    await addItems(page, 'Mix', 'Knead', 'Prove')
    await expect(page.locator('li[data-next]')).toContainText('1.')

    await page.getByLabel('Done: Mix').check()
    await expect(page.locator('li[data-next] input[aria-label="Item"]')).toHaveValue('Knead')

    // Alt+↓ moves an item down.
    await page.getByLabel('Item', { exact: true }).nth(1).focus()
    await page.keyboard.press('Alt+ArrowDown')
    expect(await itemTexts(page)).toEqual(['Mix', 'Prove', 'Knead'])
  })

  test('27.4 An item can carry a note', async ({ vaultPage: page }) => {
    await createList(page, 'Groceries', 'Checklist')
    await addItems(page, 'Milk')
    await page.getByRole('button', { name: 'Add a note' }).click()
    await page.getByLabel('Note for Milk').fill('2 × semi-skimmed')
    await page.getByLabel('Add an item').click()
    await expect(page.getByText('2 × semi-skimmed')).toBeVisible()
  })

  test('27.6 New → List makes a .list.md in the vault that opens in the list editor', async ({
    vaultPage: page,
  }) => {
    await navigateTo(page, 'vault')
    const newList = page.getByRole('button', { name: 'List', exact: true }).first()
    if (!(await newList.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: /^New/ }).first().click()
    }
    await newList.click()
    await expect(page.getByRole('heading', { name: /^List \d{4}-\d{2}-\d{2}$/ })).toBeVisible({
      timeout: 10_000,
    })
    await addItems(page, 'First thing')
    await expect(page.getByLabel('Item', { exact: true })).toHaveValue('First thing')
  })

  test('27.7 A new list is a .list.md in the Lists folder', async ({ vaultPage: page }) => {
    await createList(page, 'Packing', 'Checklist')
    await addItems(page, 'Passport')
    await expect
      .poll(() => readVaultFile(page, 'Lists/Packing.list.md'), { timeout: 10_000 })
      .toContain('- [ ] Passport')
  })

  test('27.8 A list keeps out of Tasks, turns into a note and back by renaming', async ({
    vaultPage: page,
  }) => {
    await writeVaultFile(page, 'Shop.list.md', '---\ntype: list\n---\n- [ ] Milk\n- [ ] Bread\n')
    await writeVaultFile(page, 'Todo.md', '- [ ] Real task\n')
    // Files written behind the app's back are indexed when the vault opens.
    await page.reload()
    await page.waitForSelector('[data-testid="main-sidebar"]:visible, nav:visible', {
      timeout: 30_000,
    })

    // In Tasks: the real task, not the list's items; the list under Lists.
    await page.keyboard.press('Control+4')
    await page.getByRole('button', { name: 'All tasks', exact: true }).first().click()
    await expect(page.getByText('Real task')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Milk')).toHaveCount(0)
    await page.getByRole('button', { name: 'Lists', exact: true }).first().click()
    await expect(page.getByRole('button', { name: /^Shop.*0 of 2 done/ })).toBeVisible({
      timeout: 10_000,
    })

    // From the tree (titled without the suffix) it opens in the list editor.
    await openVaultFile(page, 'Shop.list.md')
    await expect(page.getByLabel('Done: Milk')).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: 'Turn into a note' }).click()
    await expect(page.locator('.tiptap').first()).toContainText('Milk', { timeout: 10_000 })
    await expect.poll(() => readVaultFile(page, 'Shop.md')).toContain('- [ ] Milk')
    await expect.poll(() => readVaultFile(page, 'Shop.list.md')).toBe('')

    await page.getByRole('button', { name: 'Make this a list' }).click()
    await expect(page.getByLabel('Done: Milk')).toBeVisible({ timeout: 10_000 })
    await expect.poll(() => readVaultFile(page, 'Shop.list.md')).toContain('- [ ] Milk')
    await expect.poll(() => readVaultFile(page, 'Shop.md')).toBe('')
  })
})
