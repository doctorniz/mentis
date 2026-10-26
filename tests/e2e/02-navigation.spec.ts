import { test, expect, navigateTo } from './fixtures'

/**
 * Nav model under test — one sidebar: Today (Ctrl+1), Chat (2), Calendar (3,
 * with Reminders as a tab), Tasks (4, with Lists as a tab), Thoughts (5),
 * Bookmarks (6), then the file tree. The vault view and Files come from the
 * palette, Graph from the tree's heading, Search from the sidebar (Ctrl+F).
 */
test.describe('2.1 — View Switching', () => {
  test('2.1.1 Ctrl+2 — Chat view loads', async ({ vaultPage: page }) => {
    await page.keyboard.press('Control+2')
    await page.waitForTimeout(1000)

    // Vault chat shows its composer textarea
    await expect(page.locator('textarea').first()).toBeVisible({ timeout: 10_000 })
  })

  test('2.1.2 The file tree is in the sidebar beside every view', async ({ vaultPage: page }) => {
    const tree = page.getByRole('tree', { name: 'Vault file tree' })
    await expect(tree).toBeVisible({ timeout: 10_000 })
    await page.keyboard.press('Control+3')
    await expect(tree).toBeVisible()
  })

  test('2.1.3 Ctrl+5 — Thoughts view loads', async ({ vaultPage: page }) => {
    await page.keyboard.press('Control+5')
    await page.waitForTimeout(1000)

    await expect(page.getByRole('heading', { name: 'Thoughts' })).toBeVisible({ timeout: 10_000 })
  })

  test('2.1.4 Ctrl+4 — Tasks loads with a Lists tab', async ({ vaultPage: page }) => {
    await page.keyboard.press('Control+4')
    const main = page.getByRole('main')
    await expect(main.getByRole('button', { name: 'All tasks', exact: true })).toBeVisible({
      timeout: 10_000,
    })
    await expect(main.getByRole('button', { name: 'Lists', exact: true })).toBeVisible()
  })

  test('2.1.5 Ctrl+6 — Bookmarks view loads', async ({ vaultPage: page }) => {
    await page.keyboard.press('Control+6')
    await page.waitForTimeout(1000)

    const bookmarksIndicator = page
      .getByRole('button', { name: /add bookmark/i })
      .or(page.getByText(/no bookmarks/i))
    await expect(bookmarksIndicator.first()).toBeVisible({ timeout: 10_000 })
  })

  test('2.1.6 Ctrl+3 — Calendar loads with a Reminders tab', async ({ vaultPage: page }) => {
    await navigateTo(page, 'calendar')

    // Month/week/day switcher or a calendar grid
    const calendarIndicator = page
      .getByRole('button', { name: /^month$/i })
      .or(page.getByRole('button', { name: /new event/i }))
    await expect(calendarIndicator.first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('main').getByRole('button', { name: /^Reminders/ })).toBeVisible()
  })

  test('2.1.7 Graph opens from the tree', async ({ vaultPage: page }) => {
    await navigateTo(page, 'graph')

    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10_000 })
  })

  test('2.1.8 Files view loads from the palette', async ({ vaultPage: page }) => {
    await navigateTo(page, 'files')

    // Files view shows the raw browser including hidden folders
    await expect(page.getByText('_mentis').first()).toBeVisible({ timeout: 10_000 })
  })

  test('2.1.9 Search opens in the sidebar without leaving the view', async ({
    vaultPage: page,
  }) => {
    await page.keyboard.press('Control+3')
    await navigateTo(page, 'search')

    await expect(page.locator('input[aria-label="Search vault"]')).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByRole('main').getByRole('button', { name: /^Reminders/ })).toBeVisible()
  })

  test('2.1.10 Ctrl+N — New file popover opens', async ({ vaultPage: page }) => {
    await page.keyboard.press('Control+n')
    await page.waitForTimeout(500)

    // At least one file-type option appears (Note / Canvas / …)
    const options = page.getByRole('button', { name: /^(Note|Canvas|Kanban|Mindmap)$/ })
    await expect(options.first()).toBeVisible({ timeout: 5000 })
  })

  test('2.1.11 All view shortcuts cycle without crash', async ({ vaultPage: page }) => {
    const shortcuts = ['1', '2', '3', '4', '5', '6'].map((k) => `Control+${k}`)

    for (const shortcut of shortcuts) {
      await page.keyboard.press(shortcut)
      await page.waitForTimeout(800)
      // App should not crash — sidebar still present
      await expect(page.locator('aside').first()).toBeVisible({ timeout: 5000 })
    }
  })

  test('2.1.12 Sidebar nav icons highlight active state', async ({ vaultPage: page }) => {
    // Ctrl+5 goes to Thoughts — its nav button gets accent styling
    await page.keyboard.press('Control+5')
    await page.waitForTimeout(800)

    const boardBtn = page.locator('nav[aria-label="Main views"] button', { hasText: 'Thoughts' })
    await expect(boardBtn).toBeVisible({ timeout: 5000 })
    expect((await boardBtn.getAttribute('class')) ?? '').toContain('accent')

    // Switch to Bookmarks — it becomes active instead
    await page.keyboard.press('Control+6')
    await page.waitForTimeout(800)

    const bookmarksBtn = page.locator('nav[aria-label="Main views"] button', {
      hasText: 'Bookmarks',
    })
    expect((await bookmarksBtn.getAttribute('class')) ?? '').toContain('accent')
    expect((await boardBtn.getAttribute('class')) ?? '').not.toContain('accent')
  })

  test('2.1.13 A file opened from the tree shows in the editor from any view', async ({
    vaultPage: page,
  }) => {
    await page.keyboard.press('Control+6')
    await page.getByRole('button', { name: 'New note' }).first().click()
    await expect(page.locator('.tiptap').first()).toBeVisible({ timeout: 10_000 })
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
