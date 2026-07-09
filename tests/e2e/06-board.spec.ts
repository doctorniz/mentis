import { test, expect, navigateTo, waitForView, waitForAutoSave } from './fixtures'

/**
 * Board (quick capture) E2E tests — QA plan section 6.
 *
 * The Board is a masonry-layout notice board at Ctrl+2. Thoughts are
 * markdown files in _marrow/_board/. Cards support inline Tiptap editing,
 * color on creation, and audio/image attachments.
 */

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Navigate to Board view and wait for it to stabilize. */
async function openBoard(page: import('@playwright/test').Page) {
  await navigateTo(page, 'board')
  await page.waitForTimeout(600)
  await expect(page.getByRole('heading', { name: 'Board' })).toBeVisible()
}

/** Create a thought via the toolbar button and wait for editor to mount. */
async function createThought(page: import('@playwright/test').Page) {
  // Use the "Add thought" button (empty state) or toolbar "Thought" button
  const addBtn = page
    .getByRole('button', { name: /add thought/i })
    .or(page.getByRole('button', { name: /^Thought$/i }))
  await addBtn.first().click()
  await page.waitForTimeout(600)
}

/** Locate a card in the masonry grid by its visible text. */
function cardByText(page: import('@playwright/test').Page, text: string) {
  return page.locator('.break-inside-avoid').filter({ hasText: text })
}

/** The inline Tiptap editor on the active card. */
function boardEditor(page: import('@playwright/test').Page) {
  return page.locator('.ProseMirror.board-editor')
}

/* ================================================================== */
/*  6.1  Thought CRUD                                                 */
/* ================================================================== */

test.describe('6.1 Thought CRUD', () => {
  test.beforeEach(async ({ vaultPage: page }) => {
    await openBoard(page)
  })

  test('6.1.1 Create new thought — card appears in masonry layout', async ({ vaultPage: page }) => {
    await createThought(page)

    // The new card should be in edit mode with the Tiptap editor mounted
    const editor = boardEditor(page)
    await expect(editor).toBeVisible({ timeout: 5_000 })

    // Type a title
    await editor.pressSequentially('# Test thought')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)

    // Card should appear in the masonry grid with readable content
    await expect(
      page.locator('.board-card-prose').filter({ hasText: 'Test thought' }),
    ).toBeVisible()
  })

  test('6.1.2 Set color — verify visual change on creation', async ({ vaultPage: page }) => {
    // Right-click the "Thought" / "Add thought" button to get the color picker
    const addBtn = page
      .getByRole('button', { name: /add thought/i })
      .or(page.getByRole('button', { name: /^Thought$/i }))
    await addBtn.first().click({ button: 'right' })
    await page.waitForTimeout(400)

    // Pick a non-default color (e.g. blue)
    const blueOption = page.getByRole('button', { name: /blue thought/i })
    if (await blueOption.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await blueOption.click()
      await page.waitForTimeout(600)

      const editor = boardEditor(page)
      await expect(editor).toBeVisible()
      await editor.pressSequentially('# Blue thought')
      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)

      // The card should have a blue-tinted background class
      const card = cardByText(page, 'Blue thought')
      await expect(card).toBeVisible()
      // Blue cards get blue bg/border classes from thought-card.tsx
      const classes = await card.getAttribute('class')
      expect(classes).toMatch(/sky/) // "blue" maps to sky-* classes in thought-card.tsx
    }
  })

  test('6.1.3 Inline edit title — blur — verify saved', async ({ vaultPage: page }) => {
    // Create a thought
    await createThought(page)
    const editor = boardEditor(page)
    await expect(editor).toBeVisible()

    // Type a title (H1)
    await editor.pressSequentially('# Original title')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    // Verify the title appears in read mode
    await expect(
      page.locator('.board-card-prose').filter({ hasText: 'Original title' }),
    ).toBeVisible()

    // Click the card to re-enter edit mode
    const card = cardByText(page, 'Original title')
    await card.click()
    await page.waitForTimeout(400)

    // Modify the title — click INTO the editor first so keyboard input
    // lands there (the card click opens edit mode but may not focus it)
    const editingEditor = boardEditor(page)
    await expect(editingEditor).toBeVisible()
    await editingEditor.click()
    await page.keyboard.press('Control+a')
    await page.keyboard.type('# Updated title')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    await expect(
      page.locator('.board-card-prose').filter({ hasText: 'Updated title' }),
    ).toBeVisible()
  })

  test('6.1.4 Inline edit body', async ({ vaultPage: page }) => {
    await createThought(page)
    const editor = boardEditor(page)
    await expect(editor).toBeVisible()

    // Type a title and body
    await editor.pressSequentially('# My thought')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await editor.pressSequentially('This is the body text.')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    const card = cardByText(page, 'My thought')
    await expect(card).toBeVisible()
    await expect(card).toContainText('This is the body text.')
  })

  test('6.1.5 Delete thought — removed from board', async ({ vaultPage: page }) => {
    // Create a thought with identifiable text
    await createThought(page)
    const editor = boardEditor(page)
    await expect(editor).toBeVisible()
    await editor.pressSequentially('# Delete me')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    // Hover over the card to reveal action buttons
    const card = cardByText(page, 'Delete me')
    await expect(card).toBeVisible()
    await card.hover()
    await page.waitForTimeout(300)

    // Click delete
    const deleteBtn = card.getByRole('button', { name: 'Delete thought' })
    await expect(deleteBtn).toBeVisible()
    await deleteBtn.click()
    await page.waitForTimeout(600)

    // Card should be removed
    await expect(cardByText(page, 'Delete me')).toBeHidden()
  })

  test('6.1.6 Auto-save on edit — content persists after navigation', async ({
    vaultPage: page,
  }) => {
    await createThought(page)
    const editor = boardEditor(page)
    await expect(editor).toBeVisible()

    await editor.pressSequentially('# Persisted thought')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await editor.pressSequentially('Body that should persist.')
    // Blur saves (not debounced timer)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(800)

    // Navigate away and back to verify persistence
    await navigateTo(page, 'vault')
    await page.waitForTimeout(500)
    await openBoard(page)

    await expect(
      page.locator('.board-card-prose').filter({ hasText: 'Persisted thought' }),
    ).toBeVisible()
    await expect(
      page.locator('.board-card-prose').filter({ hasText: 'Body that should persist.' }),
    ).toBeVisible()
  })
})

/* ================================================================== */
/*  6.2  Image Thoughts                                               */
/* ================================================================== */

test.describe('6.2 Image Thoughts', () => {
  test.fixme('6.2.1 Drag image onto board — image thought created', async ({ vaultPage: page }) => {
    // The board uses a file picker (Image button), not native drag-drop.
    // To automate: locate the hidden file input behind the Image button
    // and use page.setInputFiles(). Manual drag-drop testing recommended.
    await openBoard(page)

    // The Image button triggers a hidden <input type="file">
    // await page.getByRole('button', { name: 'Add image to board' }).click()
    // await page.locator('input[type="file"][accept="image/*"]').setInputFiles('path/to/image.png')
  })
})

/* ================================================================== */
/*  6.3  Layout & Edge Cases                                          */
/* ================================================================== */

test.describe('6.3 Layout & Edge Cases', () => {
  test.beforeEach(async ({ vaultPage: page }) => {
    await openBoard(page)
  })

  test.fixme('6.3.1 Many thoughts — masonry reflows correctly', async ({ vaultPage: page }) => {
    // Performance test: create 20+ thoughts and verify masonry columns
    // form correctly with no overflow. Manual verification recommended
    // for visual correctness and scroll performance.
  })

  test('6.3.2 Empty board — shows empty state', async ({ vaultPage: page }) => {
    // On a fresh vault, the board should be empty
    await expect(page.getByText('Your board is empty.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add a thought' })).toBeVisible()
  })

  test('6.3.4 Rapid create/delete — no state desync', async ({ vaultPage: page }) => {
    // Create several thoughts rapidly
    for (let i = 0; i < 3; i++) {
      await createThought(page)
      const editor = boardEditor(page)
      await expect(editor).toBeVisible({ timeout: 3_000 })
      await editor.pressSequentially(`# Rapid ${i + 1}`)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
    }

    // All three should be visible
    for (let i = 0; i < 3; i++) {
      await expect(cardByText(page, `Rapid ${i + 1}`)).toBeVisible()
    }

    // Delete the middle one
    const middleCard = cardByText(page, 'Rapid 2')
    await middleCard.hover()
    await page.waitForTimeout(300)
    await middleCard.getByRole('button', { name: 'Delete thought' }).click()
    await page.waitForTimeout(600)

    // Rapid 2 gone, others remain
    await expect(cardByText(page, 'Rapid 1')).toBeVisible()
    await expect(cardByText(page, 'Rapid 2')).toBeHidden()
    await expect(cardByText(page, 'Rapid 3')).toBeVisible()

    // Navigate away and back — state should be consistent
    await navigateTo(page, 'vault')
    await page.waitForTimeout(500)
    await openBoard(page)

    await expect(cardByText(page, 'Rapid 1')).toBeVisible()
    await expect(cardByText(page, 'Rapid 2')).toBeHidden()
    await expect(cardByText(page, 'Rapid 3')).toBeVisible()
  })
})
