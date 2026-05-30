import { test, expect, navigateTo, waitForView } from './fixtures'

test.describe('8 — Bookmark Manager', () => {
  test.beforeEach(async ({ vaultPage: page }) => {
    await waitForView(page, 'bookmarks')
  })

  // ─── 8.1 Bookmark CRUD ─────────────────────────────────────────────────────

  test.describe('8.1 Bookmark CRUD', () => {
    test('8.1.1 add bookmark by URL — metadata auto-fetched', async ({
      vaultPage: page,
    }) => {
      // Click the "+ Bookmark" button in the header
      const addBtn = page.locator('button', { hasText: 'Bookmark' }).first()
      await addBtn.click()
      await page.waitForTimeout(500)

      // Step 1: URL entry dialog
      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible({ timeout: 5_000 })

      const urlInput = dialog.getByPlaceholder('Paste a URL')
      await urlInput.fill('https://example.com')

      // Click Next
      const nextBtn = dialog.getByText('Next')
      await nextBtn.click()

      // Step 2: Details form should appear with fetched (or fallback) title
      await expect(dialog.getByText(/Title/i)).toBeVisible({ timeout: 10_000 })

      // Fill a title if the auto-fetch didn't populate one
      const titleInput = dialog.locator('input[type="text"]').first()
      const titleValue = await titleInput.inputValue()
      if (!titleValue) {
        await titleInput.fill('Example Site')
      }

      // Click Add
      const addSaveBtn = dialog.getByRole('button', { name: 'Add' })
      await addSaveBtn.click()
      await page.waitForTimeout(1_500)

      // Bookmark should appear in the list
      await expect(
        page.getByText(/example/i).first(),
      ).toBeVisible({ timeout: 5_000 })
    })

    test('8.1.3 edit bookmark — update via dialog', async ({
      vaultPage: page,
    }) => {
      // First, add a bookmark to edit
      const addBtn = page.locator('button', { hasText: 'Bookmark' }).first()
      await addBtn.click()
      await page.waitForTimeout(500)

      const dialog = page.locator('[role="dialog"]')
      const urlInput = dialog.getByPlaceholder('Paste a URL')
      await urlInput.fill('https://example.org')
      await dialog.getByText('Next').click()
      await page.waitForTimeout(2_000)

      const titleInput = dialog.locator('input[type="text"]').first()
      await titleInput.clear()
      await titleInput.fill('My Original Title')
      await dialog.getByRole('button', { name: 'Add' }).click()
      await page.waitForTimeout(1_500)

      // Hover over the bookmark card to reveal edit button
      const card = page.getByText('My Original Title').locator('xpath=ancestor::div[@role="link"]')
      await card.hover()
      await page.waitForTimeout(300)

      // Click edit
      const editBtn = card.locator('button[aria-label="Edit bookmark"]')
      await editBtn.click()
      await page.waitForTimeout(500)

      // Edit dialog should open with pre-filled values
      const editDialog = page.locator('[role="dialog"]')
      await expect(editDialog.getByText('Edit Bookmark')).toBeVisible({ timeout: 5_000 })

      // Change the title
      const editTitleInput = editDialog.locator('input[type="text"]').first()
      await editTitleInput.clear()
      await editTitleInput.fill('My Updated Title')

      // Save
      await editDialog.getByRole('button', { name: 'Save' }).click()
      await page.waitForTimeout(1_500)

      // Updated title should appear
      await expect(page.getByText('My Updated Title')).toBeVisible({ timeout: 5_000 })
    })

    test('8.1.4 delete bookmark — removed', async ({ vaultPage: page }) => {
      // Add a bookmark first
      const addBtn = page.locator('button', { hasText: 'Bookmark' }).first()
      await addBtn.click()
      await page.waitForTimeout(500)

      const dialog = page.locator('[role="dialog"]')
      const urlInput = dialog.getByPlaceholder('Paste a URL')
      await urlInput.fill('https://delete-me.example.com')
      await dialog.getByText('Next').click()
      await page.waitForTimeout(2_000)

      const titleInput = dialog.locator('input[type="text"]').first()
      await titleInput.clear()
      await titleInput.fill('Delete Me Bookmark')
      await dialog.getByRole('button', { name: 'Add' }).click()
      await page.waitForTimeout(1_500)

      const bmText = page.getByText('Delete Me Bookmark')
      await expect(bmText).toBeVisible({ timeout: 5_000 })

      // Hover to show actions
      const card = bmText.locator('xpath=ancestor::div[@role="link"]')
      await card.hover()
      await page.waitForTimeout(300)

      // Click delete
      const deleteBtn = card.locator('button[aria-label="Delete bookmark"]')
      await deleteBtn.click()
      await page.waitForTimeout(1_500)

      await expect(bmText).not.toBeVisible({ timeout: 5_000 })
    })

    test('8.1.5 unreachable URL — no crash', async ({ vaultPage: page }) => {
      const addBtn = page.locator('button', { hasText: 'Bookmark' }).first()
      await addBtn.click()
      await page.waitForTimeout(500)

      const dialog = page.locator('[role="dialog"]')
      const urlInput = dialog.getByPlaceholder('Paste a URL')
      await urlInput.fill('https://this-domain-does-not-exist-12345.example')
      await dialog.getByText('Next').click()

      // Should still proceed to details form without crashing
      await expect(dialog.getByText(/Title/i)).toBeVisible({ timeout: 15_000 })

      // Fill a fallback title and add anyway
      const titleInput = dialog.locator('input[type="text"]').first()
      await titleInput.fill('Unreachable Bookmark')
      await dialog.getByRole('button', { name: 'Add' }).click()
      await page.waitForTimeout(1_500)

      // Should be saved successfully
      await expect(page.getByText('Unreachable Bookmark')).toBeVisible({ timeout: 5_000 })
    })
  })

  // ─── 8.2 Categories & Organization ──────────────────────────────────────────

  test.describe('8.2 Categories & Organization', () => {
    test('8.2.1 create category "Tech"', async ({ vaultPage: page }) => {
      // Click "Add category" in the sidebar
      const addCatBtn = page.getByText('Add category')
      await addCatBtn.click()
      await page.waitForTimeout(300)

      // Fill category name
      const catInput = page.getByPlaceholder('Category name')
      await catInput.fill('Tech')
      await catInput.press('Enter')
      await page.waitForTimeout(1_000)

      // Category should appear in the sidebar
      await expect(page.getByText('Tech')).toBeVisible({ timeout: 5_000 })
    })

    test('8.2.3 two-panel layout: category sidebar + bookmark list', async ({
      vaultPage: page,
    }) => {
      // The sidebar should show "Categories" heading and "All Bookmarks"
      await expect(page.getByText('Categories')).toBeVisible({ timeout: 5_000 })
      await expect(page.getByText('All Bookmarks')).toBeVisible()

      // The main panel should show the bookmarks header
      await expect(
        page.locator('h1').filter({ hasText: /All Bookmarks/ }),
      ).toBeVisible()

      // The "+ Bookmark" button should be present in the header
      const addBtn = page.locator('button', { hasText: 'Bookmark' }).first()
      await expect(addBtn).toBeVisible()
    })
  })
})
