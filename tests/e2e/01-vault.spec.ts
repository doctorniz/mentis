import { test, expect, createMarkdownNote } from './fixtures'

/** The Vault file tree (lives in the main content area, not the nav sidebar). */
function vaultTree(page: import('@playwright/test').Page) {
  return page.getByRole('tree', { name: 'Vault file tree' })
}

/**
 * Rename the currently open note via the inline title input above the
 * editor (Enter commits; the file on disk is renamed to match).
 */
async function renameOpenNote(page: import('@playwright/test').Page, title: string) {
  const titleInput = page.locator('input[aria-label="Note title"]')
  await expect(titleInput).toBeVisible({ timeout: 10_000 })
  await titleInput.click()
  await titleInput.fill(title)
  await titleInput.press('Enter')
  await page.waitForTimeout(1000)
}

test.describe('1.1 — Vault Creation & Opening', () => {
  test('1.1.1 Create a new vault via OPFS — verify config.json created', async ({
    vaultPage: page,
  }) => {
    // The fixture already creates a vault via OPFS.
    // Verify the app shell loaded (sidebar/nav visible means vault opened successfully).
    await expect(page.locator('aside, nav').first()).toBeVisible({ timeout: 15_000 })

    // Verify config.json was created by checking vault name appears in sidebar
    await expect(page.locator('text=E2E Test Vault').first()).toBeVisible({ timeout: 10_000 })
  })

  test('1.1.2 Open an existing OPFS vault — verify files/settings preserved', async ({
    vaultPage: page,
  }) => {
    // Create a note so there's something to verify on re-open
    await createMarkdownNote(page)
    await renameOpenNote(page, 'Persisted Note')

    // Reload — the vault should auto-restore from OPFS
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('aside, nav', { timeout: 30_000 })

    // Vault name should still appear (settings preserved)
    await expect(page.locator('text=E2E Test Vault').first()).toBeVisible({ timeout: 10_000 })

    // The created note should still be in the tree
    await page.keyboard.press('Control+1')
    await expect(
      vaultTree(page).getByRole('button', { name: 'Persisted Note', exact: true }),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('1.1.6 Create vault with unicode characters in name', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    const landingForm = page.locator('form').filter({
      has: page.getByRole('button', { name: /create/i }),
    })
    const isLanding = await landingForm.isVisible({ timeout: 10_000 }).catch(() => false)

    if (isLanding) {
      const unicodeName = '日本語テスト 📝 Ñoño'
      const nameInput = landingForm.getByRole('textbox')
      await nameInput.clear()
      await nameInput.fill(unicodeName)
      await landingForm.getByRole('button', { name: /create/i }).click()

      // App shell should load — vault created successfully
      await page.waitForSelector('aside, nav', { timeout: 30_000 })
      await expect(page.getByText(unicodeName).first()).toBeVisible({ timeout: 10_000 })
    } else {
      test.skip(true, 'Cannot reach landing page to test vault creation')
    }
  })

  // FSAPI (showDirectoryPicker) cannot be automated without browser flags
  test.skip('1.1.3 Open vault from disk via FSAPI — requires native directory picker', () => {})
})

test.describe('1.2 — File CRUD Operations', () => {
  test('1.2.1 Create markdown file — verify appears in tree', async ({ vaultPage: page }) => {
    await createMarkdownNote(page)
    await renameOpenNote(page, 'My Test Note')

    await expect(
      vaultTree(page).getByRole('button', { name: 'My Test Note', exact: true }),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('1.2.4 Rename file — verify tabs update', async ({ vaultPage: page }) => {
    // Two notes: the editor tab bar only renders with 2+ open tabs
    await createMarkdownNote(page)
    await createMarkdownNote(page)
    await renameOpenNote(page, 'Renamed Note')

    // Tab bar should show the new name
    const tabBar = page.locator('[role="tablist"][aria-label="Open notes"]')
    await expect(tabBar.getByText('Renamed Note')).toBeVisible({ timeout: 5000 })

    // And so should the tree
    await expect(
      vaultTree(page).getByRole('button', { name: 'Renamed Note', exact: true }),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('1.2.5 Rename with case-only change — no false "already exists" error', async ({
    vaultPage: page,
  }) => {
    await createMarkdownNote(page)
    await renameOpenNote(page, 'lowercase note')

    // Case-only rename. The app treats old and new path as the same file
    // (vaultPathsPointToSameFile) and safely no-ops — renaming a file to
    // its own name with different casing on a case-insensitive FS (Windows
    // FSAPI) risks self-overwrite. What must NOT happen is a false
    // "already exists" error.
    await renameOpenNote(page, 'Lowercase Note')

    const errorToast = page.locator('[role="status"]').filter({ hasText: /already exists/i })
    await expect(errorToast).not.toBeVisible({ timeout: 2000 })

    // The note is still intact in the tree (original casing)
    await expect(
      vaultTree(page)
        .getByRole('treeitem')
        .filter({ hasText: /lowercase note/i }),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('1.2.6 Delete file — verify removed from tree', async ({ vaultPage: page }) => {
    await createMarkdownNote(page)
    await renameOpenNote(page, 'Note To Delete')

    const item = vaultTree(page).getByRole('treeitem').filter({ hasText: 'Note To Delete' })
    await expect(item).toBeVisible({ timeout: 10_000 })

    // The per-item delete button (revealed on hover)
    await item.hover()
    await item.getByRole('button', { name: /^Delete / }).click()

    // Confirm in the "Delete note?" dialog. Its button is exactly
    // "Delete" — tree-row delete buttons include the filename, so the
    // exact name is unambiguous.
    await expect(page.getByRole('heading', { name: /delete note/i })).toBeVisible({
      timeout: 5000,
    })
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await page.waitForTimeout(1000)

    // File should no longer appear in tree
    await expect(
      vaultTree(page).getByRole('button', { name: 'Note To Delete', exact: true }),
    ).not.toBeVisible({ timeout: 5000 })
  })

  test('1.2.11 Attempt to create file with / in name — rejected gracefully', async ({
    vaultPage: page,
  }) => {
    await createMarkdownNote(page)

    // The title input strips illegal filename characters as you type
    const titleInput = page.locator('input[aria-label="Note title"]')
    await titleInput.click()
    await titleInput.fill('')
    await titleInput.pressSequentially('invalid/name')
    const value = await titleInput.inputValue()
    expect(value).not.toContain('/')

    await titleInput.press('Enter')
    await page.waitForTimeout(1000)

    // No crash — the app is still functional
    await expect(page.locator('aside, nav').first()).toBeVisible()
  })
})

test.describe('1.3 — Auto-Save Behavior', () => {
  test('1.3.1 Edit note — wait — verify saved', async ({ vaultPage: page }) => {
    await createMarkdownNote(page)
    await renameOpenNote(page, 'Autosave Note')

    const editor = page.locator('.tiptap').first()
    await editor.click()
    await editor.pressSequentially('Auto-save content test')

    // Wait for auto-save debounce (~750ms + buffer)
    await page.waitForTimeout(2500)

    // Reload and verify content persisted
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('aside, nav', { timeout: 30_000 })
    await page.keyboard.press('Control+1')
    await page.waitForTimeout(1000)

    await vaultTree(page).getByRole('button', { name: 'Autosave Note', exact: true }).click()
    await expect(page.locator('.tiptap').first()).toContainText('Auto-save content test', {
      timeout: 10_000,
    })
  })

  test('1.3.3 Edit note — switch views — verify immediate save on blur', async ({
    vaultPage: page,
  }) => {
    await createMarkdownNote(page)
    await renameOpenNote(page, 'Blur Note')

    const editor = page.locator('.tiptap').first()
    await editor.click()
    await editor.pressSequentially('Blur save test')

    // Immediately switch view (unmount flush saves the note)
    await page.keyboard.press('Control+2')
    await page.waitForTimeout(1500)

    // Switch back and reopen the note
    await page.keyboard.press('Control+1')
    await page.waitForTimeout(1000)
    await vaultTree(page).getByRole('button', { name: 'Blur Note', exact: true }).click()

    await expect(page.locator('.tiptap').first()).toContainText('Blur save test', {
      timeout: 10_000,
    })
  })
})

test.describe('1.5 — Vault Structure Integrity', () => {
  test('1.5.1 Verify _marrow/ directory hidden from file tree', async ({ vaultPage: page }) => {
    await page.keyboard.press('Control+1')
    await page.waitForTimeout(1000)

    // The _marrow folder should NOT be visible in the vault tree
    await expect(vaultTree(page).getByText('_marrow')).not.toBeVisible({ timeout: 3000 })
  })

  test('1.5.8 Open Files view (Ctrl+5) — verify hidden folders visible', async ({
    vaultPage: page,
  }) => {
    // Navigate to Files view (shows hidden folders)
    await page.keyboard.press('Control+5')
    await page.waitForTimeout(1500)

    // In the Files view (FileBrowserView with showHidden), _marrow should be visible
    await expect(page.getByText('_marrow').first()).toBeVisible({ timeout: 10_000 })
  })
})
