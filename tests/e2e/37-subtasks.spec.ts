import { test, expect, navigateTo, readVaultFile } from './fixtures'

/**
 * A subtask is saved by the Add button or by Save, not only by an Enter key: a phone's
 * keyboard does not always send one.
 */

type Page = import('@playwright/test').Page

async function openTask(page: Page, title: string) {
  await navigateTo(page, 'tasks')
  await page.getByPlaceholder('Add a task...').fill(title)
  await page.getByPlaceholder('Add a task...').press('Enter')
  await page.getByText(title, { exact: true }).first().click()
  await expect(page.getByRole('dialog').getByText('Subtasks')).toBeVisible()
}

test.describe('37 — Subtasks', () => {
  test('37.1 The Add button saves a subtask under its task', async ({ vaultPage: page }) => {
    await openTask(page, 'Parent one')
    const dialog = page.getByRole('dialog')
    await dialog.getByPlaceholder('Add subtask').fill('Child one')
    await dialog.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(dialog.getByText('Child one')).toBeVisible()
    await expect
      .poll(() => readVaultFile(page, 'Tasks/Inbox.md'))
      .toMatch(/- \[ \] Parent one\r?\n {2}- \[ \] Child one/)
  })

  test('37.2 Save keeps a subtask that was typed but not added', async ({ vaultPage: page }) => {
    await openTask(page, 'Parent two')
    const dialog = page.getByRole('dialog')
    await dialog.getByPlaceholder('Add subtask').fill('Child two')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect
      .poll(() => readVaultFile(page, 'Tasks/Inbox.md'))
      .toMatch(/- \[ \] Parent two\r?\n {2}- \[ \] Child two/)
  })
})
