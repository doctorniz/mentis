import {
  test,
  expect,
  navigateTo,
  waitForView,
  createMarkdownNote,
  waitForAutoSave,
} from './fixtures'

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
  await page.evaluate(
    async ({ name, content }) => {
      const root = await navigator.storage.getDirectory()
      const vaultDir = await root.getDirectoryHandle('E2E Test Vault', { create: true })
      const fileHandle = await vaultDir.getFileHandle(name, { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(content)
      await writable.close()
    },
    { name: filename, content: KANBAN_MD },
  )
  // Dispatch vault-changed so the app picks it up
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('ink:vault-changed'))
  })
  await page.waitForTimeout(1000)
}

async function openFileInVault(page: import('@playwright/test').Page, filename: string) {
  await navigateTo(page, 'vault')
  await page.waitForTimeout(500)
  const treeItem = page.getByText(filename.replace('.md', ''))
  await treeItem.click()
  await page.waitForTimeout(1000)
}

test.describe('10 — Kanban Board', () => {
  test.describe('10.1 Board Rendering & Interaction', () => {
    test('10.1.1 .md with type: kanban frontmatter renders as board', async ({
      vaultPage: page,
    }) => {
      await createKanbanFile(page)
      await openFileInVault(page, 'board.md')

      // Should render as a kanban board, not as raw markdown
      const kanbanBoard = page.locator(
        '[data-testid="kanban-board"], .kanban-board, [class*="kanban"]',
      )
      await expect(kanbanBoard).toBeVisible({ timeout: 10_000 })
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

      // Double-click or click the card to edit
      const card = page.getByText('First task')
      await card.dblclick()
      await page.waitForTimeout(300)

      // Select all and type new text
      await page.keyboard.press('Control+a')
      await page.keyboard.type('Updated task')
      await page.keyboard.press('Escape')

      await waitForAutoSave(page)

      // Verify the updated text is visible
      await expect(page.getByText('Updated task')).toBeVisible({ timeout: 5_000 })
    })

    test('10.1.8 Toggle card checkbox', async ({ vaultPage: page }) => {
      await createKanbanFile(page)
      await openFileInVault(page, 'board.md')

      await page.waitForTimeout(1000)

      // Find a checkbox associated with "First task" and toggle it
      const checkbox = page.locator('input[type="checkbox"]').first()
      await checkbox.click()
      await waitForAutoSave(page)

      // After toggling, it should be checked
      await expect(checkbox).toBeChecked()
    })

    test('10.1.9 File remains valid .md after edits', async ({ vaultPage: page }) => {
      await createKanbanFile(page)
      await openFileInVault(page, 'board.md')

      await page.waitForTimeout(1000)

      // Toggle a checkbox to trigger a save
      const checkbox = page.locator('input[type="checkbox"]').first()
      await checkbox.click()
      await waitForAutoSave(page)

      // Read the file back from OPFS and verify it's valid markdown
      const content = await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory()
        const vaultDir = await root.getDirectoryHandle('E2E Test Vault')
        const fileHandle = await vaultDir.getFileHandle('board.md')
        const file = await fileHandle.getFile()
        return file.text()
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
