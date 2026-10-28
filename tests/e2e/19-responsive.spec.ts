import { test, expect, navigateTo } from './fixtures'

/**
 * Responsive layout consistency — QA for the app-wide mobile policy:
 *
 *   - ONE breakpoint: md (768px). Below it every view-level sidebar
 *     becomes a MobileDrawer; at or above it the sidebar is static.
 *   - The drawer trigger shows the section's own icon (Vault,
 *     CheckSquare, Bookmark, Sparkles), not a hamburger.
 *
 * The `mobile` Playwright project is still queued for repair (E2E1),
 * so these run in the chromium project with per-test viewport resizes.
 */

const PHONE = { width: 375, height: 667 }

test.describe('19 — Responsive layout consistency', () => {
  test('19.1 Tasks: the groupings and the add bar fit a phone', async ({ vaultPage: page }) => {
    await page.setViewportSize(PHONE)
    await navigateTo(page, 'tasks')
    await expect(page.getByRole('radio', { name: 'By date' })).toBeVisible()
    await expect(page.getByRole('radio', { name: 'By note' })).toBeVisible()
    await expect(page.getByPlaceholder('Add a task...')).toBeVisible()
  })

  test('19.3 Bookmarks: drawer below md with Bookmark icon trigger', async ({
    vaultPage: page,
  }) => {
    await page.setViewportSize(PHONE)
    await navigateTo(page, 'bookmarks')

    const trigger = page.getByRole('button', { name: 'Open categories' })
    await expect(trigger).toBeVisible()
    // The static category sidebar is hidden on mobile
    await expect(page.getByText('Categories')).toBeHidden()

    await trigger.click()
    const drawer = page.getByRole('dialog')
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole('heading', { name: 'Categories', exact: true })).toBeVisible()

    // Picking a category closes the drawer
    await drawer.getByRole('button', { name: 'All Bookmarks' }).click()
    await expect(drawer).toBeHidden()
  })

  test('19.4 Chat: thread drawer opens from the section-icon trigger', async ({
    vaultPage: page,
  }) => {
    await page.setViewportSize(PHONE)
    await navigateTo(page, 'chat')

    const trigger = page.getByRole('button', { name: 'Open chat list' })
    await expect(trigger).toBeVisible()
    await trigger.click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Escape closes (Radix behavior every drawer now inherits)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
  })

  test('19.5 Vault: the tree is the Notes tab on a phone', async ({ vaultPage: page }) => {
    await page.setViewportSize(PHONE)
    await page.getByTestId('mobile-tab-bar').getByRole('button', { name: 'Notes' }).click()

    const tree = page.getByRole('tree', { name: 'Vault file tree' })
    await expect(tree).toBeVisible()
    await tree.getByRole('button', { name: 'Welcome', exact: true }).click()
    await expect(page.locator('.tiptap').first()).toBeVisible({ timeout: 15_000 })
  })

  test('19.6 Calendar: defaults to day view on mobile, toolbar intact', async ({
    vaultPage: page,
  }) => {
    await page.setViewportSize(PHONE)
    await navigateTo(page, 'calendar')

    // Fresh vault (no persisted preference) → day view on a phone
    const dayBtn = page.getByRole('button', { name: 'day', exact: true })
    await expect(dayBtn).toBeVisible()
    expect((await dayBtn.getAttribute('class')) ?? '').toContain('bg-accent')

    // The New-event control is still reachable (toolbar wraps, not clipped)
    await expect(page.getByRole('button', { name: /new event/i })).toBeVisible()
  })
})
