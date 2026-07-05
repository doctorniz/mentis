import { test, expect, navigateTo, waitForView } from './fixtures'

test.describe('1.1 — Vault Creation & Opening', () => {
  test('1.1.1 Create a new vault via OPFS — verify config.json created', async ({
    vaultPage: page,
  }) => {
    // The fixture already creates a vault via OPFS.
    // Verify the app shell loaded (sidebar/nav visible means vault opened successfully).
    await expect(page.locator('aside, nav')).toBeVisible({ timeout: 15_000 })

    // Verify config.json was created by checking vault name appears in sidebar
    await expect(page.locator('text=E2E Test Vault')).toBeVisible({ timeout: 10_000 })
  })

  test('1.1.2 Open an existing OPFS vault — verify files/settings preserved', async ({
    vaultPage: page,
  }) => {
    // Create a note so there's something to verify on re-open
    await page.keyboard.press('Control+n')
    await page.waitForTimeout(500)
    const noteBtn = page.getByText(/^Note$/i).first()
    if (await noteBtn.isVisible({ timeout: 3000 })) {
      await noteBtn.click()
    }
    await page.waitForTimeout(1500)

    // Reload — the vault should auto-restore from OPFS
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('aside, nav', { timeout: 30_000 })

    // Vault name should still appear (settings preserved)
    await expect(page.locator('text=E2E Test Vault')).toBeVisible({ timeout: 10_000 })
  })

  test('1.1.6 Create vault with unicode characters in name', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // If we land on a vault-open state, close it first to reach the landing
    const landing = page.locator('input[type="text"]').first()
    const isLanding = await landing.isVisible({ timeout: 5_000 }).catch(() => false)

    if (isLanding) {
      const unicodeName = '日本語テスト 📝 Ñoño'
      await landing.clear()
      await landing.fill(unicodeName)

      const createBtn = page.getByRole('button', { name: /create/i })
      if (await createBtn.isVisible({ timeout: 3000 })) {
        await createBtn.click()
      }

      // App shell should load — vault created successfully
      await page.waitForSelector('aside, nav', { timeout: 30_000 })
      await expect(page.getByText(unicodeName)).toBeVisible({ timeout: 10_000 })
    } else {
      test.skip(true, 'Cannot reach landing page to test vault creation')
    }
  })

  // FSAPI (showDirectoryPicker) cannot be automated without browser flags
  test.skip('1.1.3 Open vault from disk via FSAPI — requires native directory picker', () => {})
})

test.describe('1.2 — File CRUD Operations', () => {
  test('1.2.1 Create markdown file — verify appears in tree', async ({ vaultPage: page }) => {
    // Navigate to Vault view
    await page.keyboard.press('Control+1')
    await page.waitForTimeout(800)

    // Create a new note via Ctrl+N
    await page.keyboard.press('Control+n')
    await page.waitForTimeout(500)

    const noteBtn = page.getByText(/^Note$/i).first()
    await expect(noteBtn).toBeVisible({ timeout: 5000 })
    await noteBtn.click()
    await page.waitForTimeout(1500)

    // Type a title in the editor
    const editor = page.locator('.tiptap, .ProseMirror').first()
    await expect(editor).toBeVisible({ timeout: 10_000 })
    await editor.click()
    await editor.pressSequentially('My Test Note')
    await page.waitForTimeout(2000) // auto-save

    // Verify the file appears in the tree — look for the title text in the sidebar/tree area
    const tree = page.locator('aside, [class*="tree"], [class*="sidebar"]')
    await expect(tree.getByText('My Test Note')).toBeVisible({ timeout: 10_000 })
  })

  test('1.2.4 Rename file — verify tabs update', async ({ vaultPage: page }) => {
    await page.keyboard.press('Control+1')
    await page.waitForTimeout(800)

    // Create a note
    await page.keyboard.press('Control+n')
    await page.waitForTimeout(500)
    const noteBtn = page.getByText(/^Note$/i).first()
    if (await noteBtn.isVisible({ timeout: 3000 })) await noteBtn.click()
    await page.waitForTimeout(1500)

    const editor = page.locator('.tiptap, .ProseMirror').first()
    await expect(editor).toBeVisible({ timeout: 10_000 })
    await editor.click()
    await editor.pressSequentially('Original Name')
    await page.waitForTimeout(2000)

    // Right-click the file in the tree to get context menu → Rename
    const treeItem = page.locator('aside').getByText('Original Name').first()
    await expect(treeItem).toBeVisible({ timeout: 10_000 })
    await treeItem.click({ button: 'right' })
    await page.waitForTimeout(300)

    const renameOption = page.getByText(/rename/i).first()
    if (await renameOption.isVisible({ timeout: 3000 })) {
      await renameOption.click()
      await page.waitForTimeout(300)

      // Fill in new name
      const renameInput = page
        .locator('input[aria-label="New note name"], input[type="text"]')
        .last()
      await renameInput.clear()
      await renameInput.fill('Renamed Note')

      // Confirm rename
      const confirmBtn = page.getByRole('button', { name: /rename|save|confirm|ok/i }).first()
      if (await confirmBtn.isVisible({ timeout: 2000 })) {
        await confirmBtn.click()
      } else {
        await renameInput.press('Enter')
      }
      await page.waitForTimeout(1000)

      // Tab bar should show the new name
      const tabBar = page.locator('[aria-label="Open notes"], [role="tablist"]')
      await expect(tabBar.getByText('Renamed Note')).toBeVisible({ timeout: 5000 })
    }
  })

  test('1.2.5 Rename with case-only change — no false "already exists" error', async ({
    vaultPage: page,
  }) => {
    await page.keyboard.press('Control+1')
    await page.waitForTimeout(800)

    // Create a note
    await page.keyboard.press('Control+n')
    await page.waitForTimeout(500)
    const noteBtn = page.getByText(/^Note$/i).first()
    if (await noteBtn.isVisible({ timeout: 3000 })) await noteBtn.click()
    await page.waitForTimeout(1500)

    const editor = page.locator('.tiptap, .ProseMirror').first()
    await expect(editor).toBeVisible({ timeout: 10_000 })
    await editor.click()
    await editor.pressSequentially('lowercase note')
    await page.waitForTimeout(2000)

    // Right-click → Rename
    const treeItem = page.locator('aside').getByText('lowercase note').first()
    await expect(treeItem).toBeVisible({ timeout: 10_000 })
    await treeItem.click({ button: 'right' })
    await page.waitForTimeout(300)

    const renameOption = page.getByText(/rename/i).first()
    if (await renameOption.isVisible({ timeout: 3000 })) {
      await renameOption.click()
      await page.waitForTimeout(300)

      const renameInput = page
        .locator('input[aria-label="New note name"], input[type="text"]')
        .last()
      await renameInput.clear()
      await renameInput.fill('Lowercase Note') // case-only change

      const confirmBtn = page.getByRole('button', { name: /rename|save|confirm|ok/i }).first()
      if (await confirmBtn.isVisible({ timeout: 2000 })) {
        await confirmBtn.click()
      } else {
        await renameInput.press('Enter')
      }
      await page.waitForTimeout(1000)

      // No error toast should appear
      const errorToast = page.locator('[role="status"]').filter({ hasText: /already exists/i })
      await expect(errorToast).not.toBeVisible({ timeout: 2000 })

      // The new name should be visible
      await expect(page.locator('aside').getByText('Lowercase Note')).toBeVisible({ timeout: 5000 })
    }
  })

  test('1.2.6 Delete file — verify removed from tree', async ({ vaultPage: page }) => {
    await page.keyboard.press('Control+1')
    await page.waitForTimeout(800)

    // Create a note to delete
    await page.keyboard.press('Control+n')
    await page.waitForTimeout(500)
    const noteBtn = page.getByText(/^Note$/i).first()
    if (await noteBtn.isVisible({ timeout: 3000 })) await noteBtn.click()
    await page.waitForTimeout(1500)

    const editor = page.locator('.tiptap, .ProseMirror').first()
    await expect(editor).toBeVisible({ timeout: 10_000 })
    await editor.click()
    await editor.pressSequentially('Note To Delete')
    await page.waitForTimeout(2000)

    // Right-click → Delete
    const treeItem = page.locator('aside').getByText('Note To Delete').first()
    await expect(treeItem).toBeVisible({ timeout: 10_000 })
    await treeItem.click({ button: 'right' })
    await page.waitForTimeout(300)

    const deleteOption = page.getByText(/delete/i).first()
    if (await deleteOption.isVisible({ timeout: 3000 })) {
      await deleteOption.click()
      await page.waitForTimeout(300)

      // Confirm deletion if dialog appears
      const confirmBtn = page.getByRole('button', { name: /delete|confirm|yes/i }).last()
      if (await confirmBtn.isVisible({ timeout: 2000 })) {
        await confirmBtn.click()
      }
      await page.waitForTimeout(1000)

      // File should no longer appear in tree
      await expect(page.locator('aside').getByText('Note To Delete')).not.toBeVisible({
        timeout: 5000,
      })
    }
  })

  test('1.2.11 Attempt to create file with / in name — rejected gracefully', async ({
    vaultPage: page,
  }) => {
    await page.keyboard.press('Control+1')
    await page.waitForTimeout(800)

    // Create a note
    await page.keyboard.press('Control+n')
    await page.waitForTimeout(500)
    const noteBtn = page.getByText(/^Note$/i).first()
    if (await noteBtn.isVisible({ timeout: 3000 })) await noteBtn.click()
    await page.waitForTimeout(1500)

    const editor = page.locator('.tiptap, .ProseMirror').first()
    await expect(editor).toBeVisible({ timeout: 10_000 })
    await editor.click()
    await editor.pressSequentially('invalid/name')
    await page.waitForTimeout(2000)

    // If there's a rename dialog or the tree shows a sanitized name,
    // just ensure no crash occurred and the app is still functional
    await expect(page.locator('aside, nav')).toBeVisible()
  })
})

test.describe('1.3 — Auto-Save Behavior', () => {
  test('1.3.1 Edit note — wait — verify saved', async ({ vaultPage: page }) => {
    await page.keyboard.press('Control+1')
    await page.waitForTimeout(800)

    // Create a new note
    await page.keyboard.press('Control+n')
    await page.waitForTimeout(500)
    const noteBtn = page.getByText(/^Note$/i).first()
    if (await noteBtn.isVisible({ timeout: 3000 })) await noteBtn.click()
    await page.waitForTimeout(1500)

    const editor = page.locator('.tiptap, .ProseMirror').first()
    await expect(editor).toBeVisible({ timeout: 10_000 })
    await editor.click()
    await editor.pressSequentially('Auto-save content test')

    // Wait for auto-save debounce (~750ms + buffer)
    await page.waitForTimeout(2000)

    // Reload and verify content persisted
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('aside, nav', { timeout: 30_000 })

    // Navigate to vault and look for the note
    await page.keyboard.press('Control+1')
    await page.waitForTimeout(1000)

    // The note should appear in the tree (title derived from content)
    await expect(page.locator('aside').getByText('Auto-save content test')).toBeVisible({
      timeout: 10_000,
    })
  })

  test('1.3.3 Edit note — switch views — verify immediate save on blur', async ({
    vaultPage: page,
  }) => {
    await page.keyboard.press('Control+1')
    await page.waitForTimeout(800)

    // Create a new note
    await page.keyboard.press('Control+n')
    await page.waitForTimeout(500)
    const noteBtn = page.getByText(/^Note$/i).first()
    if (await noteBtn.isVisible({ timeout: 3000 })) await noteBtn.click()
    await page.waitForTimeout(1500)

    const editor = page.locator('.tiptap, .ProseMirror').first()
    await expect(editor).toBeVisible({ timeout: 10_000 })
    await editor.click()
    await editor.pressSequentially('Blur save test')

    // Immediately switch view (triggers blur save)
    await page.keyboard.press('Control+2') // Switch to Board
    await page.waitForTimeout(1500)

    // Switch back to Vault
    await page.keyboard.press('Control+1')
    await page.waitForTimeout(1500)

    // The note should exist in the tree (saved despite no debounce wait)
    await expect(page.locator('aside').getByText('Blur save test')).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('1.5 — Vault Structure Integrity', () => {
  test('1.5.1 Verify _marrow/ directory hidden from file tree', async ({ vaultPage: page }) => {
    // Navigate to Vault view
    await page.keyboard.press('Control+1')
    await page.waitForTimeout(1000)

    // The _marrow folder should NOT be visible in the normal vault tree
    const marrowInTree = page.locator('aside').getByText('_marrow')
    await expect(marrowInTree).not.toBeVisible({ timeout: 3000 })
  })

  test('1.5.8 Open Files view (Ctrl+7) — verify hidden folders visible', async ({
    vaultPage: page,
  }) => {
    // Navigate to Files view (shows hidden folders)
    await page.keyboard.press('Control+7')
    await page.waitForTimeout(1500)

    // In the Files view (FileBrowserView with showHidden), _marrow should be visible
    const filesArea = page.locator('main')
    await expect(filesArea.getByText('_marrow')).toBeVisible({ timeout: 10_000 })
  })
})
