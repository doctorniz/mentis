import { test, expect, waitForAutoSave, writeVaultFile, openVaultFile } from './fixtures'

const KANBAN_MD = `---
type: kanban
---

## To Do
<!--kanban:amber-->
- [ ] First task
- [ ] Second task

## In Progress
<!--kanban:sky-->
- [ ] Working on this

## Done
<!--kanban:emerald-->
- [x] Completed item
`

async function createKanbanFile(page: import('@playwright/test').Page, filename = 'board.md') {
  await writeVaultFile(page, filename, KANBAN_MD)
}

async function openFileInVault(page: import('@playwright/test').Page, filename: string) {
  await openVaultFile(page, filename)
}

test.describe('10 — Kanban Board', () => {
  test.describe('10.1 Board Rendering & Interaction', () => {
    test('10.1.1 .md with type: kanban frontmatter renders as board', async ({
      vaultPage: page,
    }) => {
      await createKanbanFile(page)
      await openFileInVault(page, 'board.md')

      // Rendered as a board: column headings become h3s with card counts
      // (raw markdown would show ## text inside an editor instead)
      await expect(page.getByRole('heading', { name: 'To Do', level: 3 })).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByRole('heading', { name: 'In Progress', level: 3 })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Done', level: 3 })).toBeVisible()
    })

    test('10.1.2 Columns rendered from ## headings', async ({ vaultPage: page }) => {
      await createKanbanFile(page)
      await openFileInVault(page, 'board.md')

      await page.waitForTimeout(1000)

      // Should see three columns: To Do, In Progress, Done
      await expect(page.getByText('To Do')).toBeVisible({ timeout: 10_000 })
      await expect(page.getByText('In Progress')).toBeVisible()
      await expect(page.getByText('Done')).toBeVisible()
    })

    test('10.1.4 Cards rendered from - [ ] / - [x] items', async ({ vaultPage: page }) => {
      await createKanbanFile(page)
      await openFileInVault(page, 'board.md')

      await page.waitForTimeout(1000)

      // Should see card text from the markdown list items
      await expect(page.getByText('First task')).toBeVisible({ timeout: 10_000 })
      await expect(page.getByText('Second task')).toBeVisible()
      await expect(page.getByText('Working on this')).toBeVisible()
      await expect(page.getByText('Completed item')).toBeVisible()
    })

    test.fixme('10.1.5 Drag card between columns', async ({ vaultPage: page }) => {
      // Complex DnD interaction — hard to simulate reliably in Playwright
      await createKanbanFile(page)
      await openFileInVault(page, 'board.md')

      await page.waitForTimeout(1000)

      const card = page.getByText('First task')
      const targetColumn = page.getByText('In Progress').locator('..')

      await card.dragTo(targetColumn)
      await waitForAutoSave(page)
    })

    test('10.1.7 Edit card text inline', async ({ vaultPage: page }) => {
      await createKanbanFile(page)
      await openFileInVault(page, 'board.md')

      await page.waitForTimeout(1000)

      // Click the card text to open the inline rename input
      const card = page.getByText('First task')
      await card.click()
      const input = page.locator('input[type="text"][value]').or(page.locator('input:focus'))
      await expect(input.first()).toBeVisible({ timeout: 3_000 })

      // Replace the text and COMMIT with Enter (Escape cancels the edit)
      await page.keyboard.press('Control+a')
      await page.keyboard.type('Updated task')
      await page.keyboard.press('Enter')

      await waitForAutoSave(page)

      // Verify the updated text is visible
      await expect(page.getByText('Updated task')).toBeVisible({ timeout: 5_000 })
    })

    test('10.1.8 Toggle card checkbox', async ({ vaultPage: page }) => {
      await createKanbanFile(page)
      await openFileInVault(page, 'board.md')

      await page.waitForTimeout(1000)

      // Kanban cards use a custom checkbox button (role=checkbox)
      const checkbox = page.getByRole('checkbox', { name: 'Check card' }).first()
      await checkbox.click()
      await waitForAutoSave(page)

      // After toggling, it flips to checked
      await expect(page.getByRole('checkbox', { name: 'Uncheck card' }).first()).toBeVisible()
    })

    test('10.1.9 File remains valid .md after edits', async ({ vaultPage: page }) => {
      await createKanbanFile(page)
      await openFileInVault(page, 'board.md')

      await page.waitForTimeout(1000)

      // Toggle a card checkbox to trigger a save
      const checkbox = page.getByRole('checkbox', { name: 'Check card' }).first()
      await checkbox.click()
      await waitForAutoSave(page)

      // Read the file back from OPFS and verify it's valid markdown
      const content = await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory()
        const vaultsDir = await root.getDirectoryHandle('vaults')
        const iter = (
          vaultsDir as unknown as { values(): AsyncIterable<FileSystemHandle> }
        ).values()
        for await (const entry of iter) {
          if (entry.kind === 'directory') {
            const fileHandle = await (entry as FileSystemDirectoryHandle).getFileHandle('board.md')
            const file = await fileHandle.getFile()
            return file.text()
          }
        }
        throw new Error('vault not found')
      })

      // Should still have frontmatter
      expect(content).toContain('type: kanban')
      // Should still have column headings
      expect(content).toContain('## ')
      // Should still have list items
      expect(content).toMatch(/- \[[ x]\]/)
    })
  })
})
