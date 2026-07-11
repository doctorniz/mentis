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
/** Inside the old 640–767px gap where Tasks used to stay desktop-mode. */
const TABLET_GAP = { width: 700, height: 900 }

test.describe('19 — Responsive layout consistency', () => {
  test('19.1 Tasks: drawer below md, including the 640–767 gap', async ({ vaultPage: page }) => {
    for (const viewport of [PHONE, TABLET_GAP]) {
      await page.setViewportSize(viewport)
      await navigateTo(page, 'tasks')

      // Desktop sidebar hidden; section-icon trigger shown
      const trigger = page.getByRole('button', { name: 'Open task lists' })
      await expect(trigger).toBeVisible()
      await expect(page.getByRole('button', { name: 'Inbox' })).toBeHidden()

      // Trigger opens the drawer; picking a list closes it
      await trigger.click()
      const drawer = page.getByRole('dialog')
      await expect(drawer).toBeVisible()
      await drawer.getByRole('button', { name: 'Inbox' }).click()
      await expect(drawer).toBeHidden()
    }
  })

  test('19.2 Tasks: static sidebar at md+', async ({ vaultPage: page }) => {
    await page.setViewportSize({ width: 900, height: 700 })
    await navigateTo(page, 'tasks')

    await expect(page.getByRole('button', { name: 'Inbox' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open task lists' })).toBeHidden()
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

  test('19.5 Vault: tree opens as a drawer on mobile', async ({ vaultPage: page }) => {
    await page.setViewportSize(PHONE)
    await navigateTo(page, 'vault')

    // Tree auto-collapses to the rail on mobile; its toggle is the Vault icon
    const trigger = page.getByRole('button', { name: 'Open vault tree' })
    await expect(trigger).toBeVisible()
    await trigger.click()

    const drawer = page.getByRole('dialog')
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole('tree', { name: 'Vault file tree' })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
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
