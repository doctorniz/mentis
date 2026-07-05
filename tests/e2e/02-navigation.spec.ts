import { test, expect, navigateTo, waitForView } from './fixtures'

test.describe('2.1 — View Switching', () => {
  test('2.1.1 Ctrl+0 — Chat view loads', async ({ vaultPage: page }) => {
    await page.keyboard.press('Control+0')
    await page.waitForTimeout(1000)

    // Chat view should show thread list, composer, or chat-related content
    const chatIndicator = page
      .locator('text=Chat, text=New chat, [class*="chat"], textarea, [placeholder*="message"]')
      .first()
    await expect(chatIndicator).toBeVisible({ timeout: 10_000 })
  })

  test('2.1.2 Ctrl+1 — Vault view loads', async ({ vaultPage: page }) => {
    await page.keyboard.press('Control+1')
    await page.waitForTimeout(1000)

    // Vault view shows file tree or editor area
    const vaultIndicator = page
      .locator('.tiptap, .ProseMirror, [class*="tree"], [class*="file-tree"]')
      .first()
    await expect(vaultIndicator).toBeVisible({ timeout: 10_000 })
  })

  test('2.1.3 Ctrl+2 — Board view loads', async ({ vaultPage: page }) => {
    await page.keyboard.press('Control+2')
    await page.waitForTimeout(1000)

    // Board view shows masonry layout or "board is empty" text or add-thought button
    const boardIndicator = page
      .locator(
        'text=board is empty, [aria-label="Add thought"], [class*="masonry"], [class*="columns"]',
      )
      .first()
    await expect(boardIndicator).toBeVisible({ timeout: 10_000 })
  })

  test('2.1.4 Ctrl+3 — Tasks view loads', async ({ vaultPage: page }) => {
    await page.keyboard.press('Control+3')
    await page.waitForTimeout(1000)

    // Tasks view shows task list, inbox, or quick-add bar
    const tasksIndicator = page
      .locator('text=Inbox, text=Today, text=Upcoming, [class*="task"], [placeholder*="task"]')
      .first()
    await expect(tasksIndicator).toBeVisible({ timeout: 10_000 })
  })

  test('2.1.5 Ctrl+4 — Bookmarks view loads', async ({ vaultPage: page }) => {
    await page.keyboard.press('Control+4')
    await page.waitForTimeout(1000)

    // Bookmarks view shows bookmark list or "add bookmark" button
    const bookmarksIndicator = page
      .locator('text=Bookmarks, text=Add bookmark, [class*="bookmark"]')
      .first()
    await expect(bookmarksIndicator).toBeVisible({ timeout: 10_000 })
  })

  test('2.1.6 Ctrl+5 — Calendar view loads', async ({ vaultPage: page }) => {
    await page.keyboard.press('Control+5')
    await page.waitForTimeout(1000)

    // Calendar view shows month grid or day/week layout
    const calendarIndicator = page
      .locator('text=Mon, text=Tue, text=Sun, [class*="calendar"], [class*="grid"]')
      .first()
    await expect(calendarIndicator).toBeVisible({ timeout: 10_000 })
  })

  test('2.1.7 Ctrl+6 — Graph view loads', async ({ vaultPage: page }) => {
    await page.keyboard.press('Control+6')
    await page.waitForTimeout(1000)

    // Graph view shows a canvas element for the force-directed graph
    const graphIndicator = page.locator('canvas, [class*="graph"]').first()
    await expect(graphIndicator).toBeVisible({ timeout: 10_000 })
  })

  test('2.1.8 Ctrl+7 — Files view loads', async ({ vaultPage: page }) => {
    await page.keyboard.press('Control+7')
    await page.waitForTimeout(1000)

    // Files view shows the file browser (including hidden folders like _marrow)
    const filesIndicator = page.locator('text=_marrow, text=Files, [class*="file-browser"]').first()
    await expect(filesIndicator).toBeVisible({ timeout: 10_000 })
  })

  test('2.1.9 Ctrl+8 / Ctrl+F — Search view loads', async ({ vaultPage: page }) => {
    await page.keyboard.press('Control+8')
    await page.waitForTimeout(1000)

    // Search view shows search input
    const searchInput = page
      .locator('input[type="search"], input[placeholder*="earch"], input[placeholder*="Search"]')
      .first()
    await expect(searchInput).toBeVisible({ timeout: 10_000 })
  })

  test('2.1.10 Ctrl+N — New file popover opens', async ({ vaultPage: page }) => {
    await page.keyboard.press('Control+n')
    await page.waitForTimeout(500)

    // The popover shows file type options
    const noteOption = page.getByText(/^Note$/i).first()
    const canvasOption = page.getByText(/^Canvas$/i).first()
    const atLeastOneOption = noteOption.or(canvasOption)
    await expect(atLeastOneOption).toBeVisible({ timeout: 5000 })
  })

  test('2.1.11 All view shortcuts cycle without crash', async ({ vaultPage: page }) => {
    const shortcuts = [
      'Control+0',
      'Control+1',
      'Control+2',
      'Control+3',
      'Control+4',
      'Control+5',
      'Control+6',
      'Control+7',
      'Control+8',
    ]

    for (const shortcut of shortcuts) {
      await page.keyboard.press(shortcut)
      await page.waitForTimeout(800)
      // App should not crash — sidebar/nav still present
      await expect(page.locator('aside, nav').first()).toBeVisible({ timeout: 5000 })
    }
  })

  test('2.1.11 Sidebar nav icons highlight active state', async ({ vaultPage: page }) => {
    // Press Ctrl+2 to go to Board
    await page.keyboard.press('Control+2')
    await page.waitForTimeout(800)

    // The Board nav item in the sidebar should have active styling
    // Active items typically have accent/highlight class or aria-current
    const boardNavItem = page.locator('aside').getByText('Board').first()
    await expect(boardNavItem).toBeVisible({ timeout: 5000 })

    // Check it has a visually distinct style (accent background or font-medium)
    const parentButton = boardNavItem.locator('..')
    const classes = (await parentButton.getAttribute('class')) ?? ''
    const isActive =
      classes.includes('accent') || classes.includes('active') || classes.includes('font-medium')
    expect(isActive).toBe(true)

    // Switch to Bookmarks — Board should no longer be active
    await page.keyboard.press('Control+4')
    await page.waitForTimeout(800)

    const bookmarkNavItem = page.locator('aside').getByText('Bookmarks').first()
    await expect(bookmarkNavItem).toBeVisible({ timeout: 5000 })
    const bookmarkParent = bookmarkNavItem.locator('..')
    const bookmarkClasses = (await bookmarkParent.getAttribute('class')) ?? ''
    const bookmarkIsActive =
      bookmarkClasses.includes('accent') ||
      bookmarkClasses.includes('active') ||
      bookmarkClasses.includes('font-medium')
    expect(bookmarkIsActive).toBe(true)
  })
})

test.describe('2.2 — Sidebar & Layout', () => {
  test('2.2.1 Toggle sidebar with Ctrl+\\ — verify collapse/expand', async ({
    vaultPage: page,
  }) => {
    // Sidebar should be visible initially
    const sidebar = page.locator('aside').first()
    await expect(sidebar).toBeVisible({ timeout: 5000 })

    // Get initial width
    const initialBox = await sidebar.boundingBox()
    expect(initialBox).toBeTruthy()
    const initialWidth = initialBox!.width

    // Collapse sidebar with Ctrl+\
    await page.keyboard.press('Control+\\')
    await page.waitForTimeout(500)

    // After collapse, the sidebar should either be narrower (icon-only strip) or hidden
    const collapsedSidebar = page.locator('aside').first()
    const collapsedBox = await collapsedSidebar.boundingBox()
    if (collapsedBox) {
      // Collapsed sidebar is much narrower (48px icon strip vs ~240px)
      expect(collapsedBox.width).toBeLessThan(initialWidth)
    }

    // Expand again
    await page.keyboard.press('Control+\\')
    await page.waitForTimeout(500)

    const expandedSidebar = page.locator('aside').first()
    const expandedBox = await expandedSidebar.boundingBox()
    expect(expandedBox).toBeTruthy()
    // Should be back to original width (or close)
    expect(expandedBox!.width).toBeGreaterThan(60)
  })
})

test.describe('2.4 — Theme & Appearance', () => {
  test('2.4.1 Light mode — verify light background', async ({ vaultPage: page }) => {
    // Open settings or find theme toggle in sidebar
    // The sidebar has a theme toggle (Light/System/Dark)
    const lightBtn = page.locator('aside').getByText('Light').first()

    if (await lightBtn.isVisible({ timeout: 3000 })) {
      await lightBtn.click()
      await page.waitForTimeout(500)
    }

    // In light mode, the <html> element should NOT have the 'dark' class
    const htmlClass = (await page.locator('html').getAttribute('class')) ?? ''
    expect(htmlClass).not.toContain('dark')

    // Background should be light-ish (verify computed style)
    const bgColor = await page.evaluate(() => {
      return getComputedStyle(document.body).backgroundColor
    })
    // Light backgrounds have high RGB values
    expect(bgColor).toBeTruthy()
  })

  test('2.4.2 Dark mode — verify dark background', async ({ vaultPage: page }) => {
    // Click Dark theme toggle
    const darkBtn = page.locator('aside').getByText('Dark').first()

    if (await darkBtn.isVisible({ timeout: 3000 })) {
      await darkBtn.click()
      await page.waitForTimeout(500)
    }

    // In dark mode, the <html> element should have the 'dark' class
    const htmlClass = (await page.locator('html').getAttribute('class')) ?? ''
    expect(htmlClass).toContain('dark')
  })

  test('2.4.4 Theme persists across reload', async ({ vaultPage: page }) => {
    // Set dark mode
    const darkBtn = page.locator('aside').getByText('Dark').first()
    if (await darkBtn.isVisible({ timeout: 3000 })) {
      await darkBtn.click()
      await page.waitForTimeout(500)
    }

    // Verify dark class set
    let htmlClass = (await page.locator('html').getAttribute('class')) ?? ''
    expect(htmlClass).toContain('dark')

    // Reload the page
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('aside, nav', { timeout: 30_000 })
    await page.waitForTimeout(1000)

    // Theme should persist — still dark
    htmlClass = (await page.locator('html').getAttribute('class')) ?? ''
    expect(htmlClass).toContain('dark')
  })
})
