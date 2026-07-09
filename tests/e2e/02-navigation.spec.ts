import { test, expect, navigateTo } from './fixtures'

/**
 * Nav model under test:
 * Ctrl+0 Chat · Ctrl+1 Vault · Ctrl+2 Board · Ctrl+3 Organizer
 * (Tasks / Lists / Calendar / Reminders sub-tabs) · Ctrl+4 Bookmarks ·
 * Ctrl+5 Files. Graph opens from inside Vault; Search is Vault's
 * left panel (Ctrl+F / tree button).
 */
test.describe('2.1 — View Switching', () => {
  test('2.1.1 Ctrl+0 — Chat view loads', async ({ vaultPage: page }) => {
    await page.keyboard.press('Control+0')
    await page.waitForTimeout(1000)

    // Vault chat shows its composer textarea
    await expect(page.locator('textarea').first()).toBeVisible({ timeout: 10_000 })
  })

  test('2.1.2 Ctrl+1 — Vault view loads', async ({ vaultPage: page }) => {
    await page.keyboard.press('Control+1')
    await page.waitForTimeout(1000)

    await expect(page.getByRole('tree', { name: 'Vault file tree' })).toBeVisible({
      timeout: 10_000,
    })
  })

  test('2.1.3 Ctrl+2 — Board view loads', async ({ vaultPage: page }) => {
    await page.keyboard.press('Control+2')
    await page.waitForTimeout(1000)

    const boardIndicator = page
      .getByText(/board is empty/i)
      .or(page.locator('[aria-label="Add thought"]'))
      .or(page.getByRole('button', { name: /add thought/i }))
    await expect(boardIndicator.first()).toBeVisible({ timeout: 10_000 })
  })

  test('2.1.4 Ctrl+3 — Organizer view loads with Tasks tab', async ({ vaultPage: page }) => {
    await page.keyboard.press('Control+3')
    await page.waitForTimeout(1000)

    // Organizer sub-tab bar
    await expect(page.getByRole('button', { name: 'Tasks', exact: true })).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByRole('button', { name: 'Calendar', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reminders', exact: true })).toBeVisible()
  })

  test('2.1.5 Ctrl+4 — Bookmarks view loads', async ({ vaultPage: page }) => {
    await page.keyboard.press('Control+4')
    await page.waitForTimeout(1000)

    const bookmarksIndicator = page
      .getByRole('button', { name: /add bookmark/i })
      .or(page.getByText(/no bookmarks/i))
    await expect(bookmarksIndicator.first()).toBeVisible({ timeout: 10_000 })
  })

  test('2.1.6 Organizer → Calendar tab loads', async ({ vaultPage: page }) => {
    await navigateTo(page, 'calendar')

    // Month/week/day switcher or a calendar grid
    const calendarIndicator = page
      .getByRole('button', { name: /^month$/i })
      .or(page.getByRole('button', { name: /new event/i }))
    await expect(calendarIndicator.first()).toBeVisible({ timeout: 10_000 })
  })

  test('2.1.7 Graph opens from Vault', async ({ vaultPage: page }) => {
    await navigateTo(page, 'graph')

    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10_000 })
  })

  test('2.1.8 Ctrl+5 — Files view loads', async ({ vaultPage: page }) => {
    await page.keyboard.press('Control+5')
    await page.waitForTimeout(1000)

    // Files view shows the raw browser including hidden folders
    await expect(page.getByText('_marrow').first()).toBeVisible({ timeout: 10_000 })
  })

  test('2.1.9 Search panel opens in Vault', async ({ vaultPage: page }) => {
    await navigateTo(page, 'search')

    await expect(page.locator('input[aria-label="Search vault"]')).toBeVisible({
      timeout: 10_000,
    })
  })

  test('2.1.10 Ctrl+N — New file popover opens', async ({ vaultPage: page }) => {
    await page.keyboard.press('Control+n')
    await page.waitForTimeout(500)

    // At least one file-type option appears (Note / Canvas / …)
    const options = page.getByRole('button', { name: /^(Note|Canvas|Kanban|Mindmap)$/ })
    await expect(options.first()).toBeVisible({ timeout: 5000 })
  })

  test('2.1.11 All view shortcuts cycle without crash', async ({ vaultPage: page }) => {
    const shortcuts = ['Control+0', 'Control+1', 'Control+2', 'Control+3', 'Control+4', 'Control+5']

    for (const shortcut of shortcuts) {
      await page.keyboard.press(shortcut)
      await page.waitForTimeout(800)
      // App should not crash — sidebar still present
      await expect(page.locator('aside').first()).toBeVisible({ timeout: 5000 })
    }
  })

  test('2.1.12 Sidebar nav icons highlight active state', async ({ vaultPage: page }) => {
    // Press Ctrl+2 to go to Board — its nav button gets accent styling
    await page.keyboard.press('Control+2')
    await page.waitForTimeout(800)

    const boardBtn = page.locator('nav[aria-label="Main views"] button', { hasText: 'Board' })
    await expect(boardBtn).toBeVisible({ timeout: 5000 })
    expect((await boardBtn.getAttribute('class')) ?? '').toContain('accent')

    // Switch to Bookmarks — it becomes active instead
    await page.keyboard.press('Control+4')
    await page.waitForTimeout(800)

    const bookmarksBtn = page.locator('nav[aria-label="Main views"] button', {
      hasText: 'Bookmarks',
    })
    expect((await bookmarksBtn.getAttribute('class')) ?? '').toContain('accent')
    expect((await boardBtn.getAttribute('class')) ?? '').not.toContain('accent')
  })
})

test.describe('2.2 — Sidebar & Layout', () => {
  test('2.2.1 Toggle sidebar with Ctrl+\\ — verify collapse/expand', async ({
    vaultPage: page,
  }) => {
    // Expanded: the main nav is visible
    const nav = page.locator('nav[aria-label="Main views"]')
    await expect(nav).toBeVisible({ timeout: 5000 })

    // Collapse — the aside is replaced by a thin strip with an expand button
    await page.keyboard.press('Control+\\')
    await page.waitForTimeout(500)
    await expect(nav).toBeHidden()
    await expect(page.locator('[aria-label="Expand sidebar"]')).toBeVisible()

    // Expand again
    await page.keyboard.press('Control+\\')
    await page.waitForTimeout(500)
    await expect(nav).toBeVisible()
  })
})

test.describe('2.4 — Theme & Appearance', () => {
  test('2.4.1 Light mode — verify light background', async ({ vaultPage: page }) => {
    await page.getByRole('radio', { name: 'Light' }).click()
    await page.waitForTimeout(500)

    const htmlClass = (await page.locator('html').getAttribute('class')) ?? ''
    expect(htmlClass).not.toContain('dark')
  })

  test('2.4.2 Dark mode — verify dark background', async ({ vaultPage: page }) => {
    await page.getByRole('radio', { name: 'Dark' }).click()
    await page.waitForTimeout(500)

    const htmlClass = (await page.locator('html').getAttribute('class')) ?? ''
    expect(htmlClass).toContain('dark')
  })

  test('2.4.4 Theme persists across reload', async ({ vaultPage: page }) => {
    await page.getByRole('radio', { name: 'Dark' }).click()
    await page.waitForTimeout(500)

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
