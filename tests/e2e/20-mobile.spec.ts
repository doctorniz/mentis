import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

/**
 * Mobile-native flows, run ONLY by the `mobile` Playwright project
 * (Pixel 5 profile: touch, mobile UA, 393×851). Everything here drives
 * the app the way a phone user does — masthead hamburger for section
 * navigation, taps, MobileDrawers — no Ctrl shortcuts, no static
 * sidebars. Desktop-viewport responsive checks live in
 * 19-responsive.spec.ts.
 */

async function openMastheadMenu(page: Page) {
  await page.getByRole('button', { name: 'Open menu' }).tap()
  await expect(page.getByRole('dialog')).toBeVisible()
}

/** Navigate to a section through the masthead menu (the mobile nav). */
async function mastheadNavigate(page: Page, label: string) {
  await openMastheadMenu(page)
  await page.getByRole('dialog').getByRole('button', { name: label, exact: true }).tap()
  await expect(page.getByRole('dialog')).toBeHidden()
  await page.waitForTimeout(400)
}

test.describe('20 — Mobile (Pixel 5)', () => {
  test('20.1 Masthead menu lists every section and navigates', async ({ vaultPage: page }) => {
    // The masthead replaces the nav sidebar on mobile
    await expect(page.getByTestId('mobile-masthead')).toBeVisible()

    const sections: { label: string; probe: () => Promise<void> }[] = [
      {
        label: 'Vault',
        probe: async () => {
          await expect(page.getByRole('button', { name: 'Open vault tree' })).toBeVisible()
        },
      },
      {
        label: 'Board',
        probe: async () => {
          await expect(
            page
              .getByText(/board is empty/i)
              .or(page.getByRole('button', { name: /add thought/i }))
              .first(),
          ).toBeVisible()
        },
      },
      {
        label: 'Organizer',
        probe: async () => {
          await expect(page.getByRole('button', { name: 'Tasks', exact: true })).toBeVisible()
        },
      },
      {
        label: 'Bookmarks',
        probe: async () => {
          await expect(page.getByRole('button', { name: 'Open categories' })).toBeVisible()
        },
      },
      {
        label: 'Files',
        probe: async () => {
          await expect(page.getByText('_marrow').first()).toBeVisible()
        },
      },
      {
        label: 'Chat',
        probe: async () => {
          await expect(page.locator('textarea').first()).toBeVisible()
        },
      },
    ]

    for (const { label, probe } of sections) {
      await mastheadNavigate(page, label)
      await probe()
    }
  })

  test('20.2 Create a note from the masthead New menu', async ({ vaultPage: page }) => {
    await openMastheadMenu(page)
    await page.getByRole('dialog').getByRole('button', { name: 'New', exact: true }).tap()
    await page.getByRole('dialog').getByRole('button', { name: 'Note', exact: true }).tap()

    // Lands in the Vault editor with the new note open
    await expect(page.locator('.tiptap').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('input[aria-label="Note title"]')).toBeVisible()
  })

  test('20.3 Vault tree drawer closes when a file is opened', async ({ vaultPage: page }) => {
    await mastheadNavigate(page, 'Vault')

    // The tree collapses to the rail on mobile; its trigger is the Vault icon
    await page.getByRole('button', { name: 'Open vault tree' }).tap()
    const drawer = page.getByRole('dialog')
    await expect(drawer).toBeVisible()

    // Tapping a file opens it AND dismisses the drawer — it must not stay
    // covering the editor the user just navigated to.
    await drawer
      .getByRole('tree', { name: 'Vault file tree' })
      .getByRole('button', { name: 'Welcome', exact: true })
      .tap()
    await expect(drawer).toBeHidden({ timeout: 5_000 })
    await expect(page.locator('.tiptap').first()).toBeVisible({ timeout: 15_000 })
  })

  test('20.4 Task lists drawer works with touch', async ({ vaultPage: page }) => {
    await mastheadNavigate(page, 'Organizer')
    await page.getByRole('button', { name: 'Tasks', exact: true }).tap()

    await page.getByRole('button', { name: 'Open task lists' }).tap()
    const drawer = page.getByRole('dialog')
    await expect(drawer).toBeVisible()
    await drawer.getByRole('button', { name: 'Inbox' }).tap()
    await expect(drawer).toBeHidden()
  })

  test('20.5 Bookmark categories drawer works with touch', async ({ vaultPage: page }) => {
    await mastheadNavigate(page, 'Bookmarks')

    await page.getByRole('button', { name: 'Open categories' }).tap()
    const drawer = page.getByRole('dialog')
    await expect(drawer).toBeVisible()
    await drawer.getByRole('button', { name: 'All Bookmarks' }).tap()
    await expect(drawer).toBeHidden()
  })

  test('20.7 Pinch gesture zooms the canvas', async ({ vaultPage: page }) => {
    // Create a canvas through the masthead New menu
    await openMastheadMenu(page)
    await page.getByRole('dialog').getByRole('button', { name: 'New', exact: true }).tap()
    await page.getByRole('dialog').getByRole('button', { name: 'Canvas', exact: true }).tap()
    await expect(page.getByText('Loading canvas…')).toBeHidden({ timeout: 15_000 })
    await page.waitForTimeout(800)

    const readout = page.getByRole('button', { name: 'Reset zoom to 100%' })
    await expect(readout).toHaveText('100%')

    // Synthesize a real two-finger pinch-out over the drawing surface
    const surface = page.locator('canvas').first()
    const box = await surface.boundingBox()
    if (!box) throw new Error('Canvas not visible')
    const client = await page.context().newCDPSession(page)
    await client.send('Input.synthesizePinchGesture', {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
      scaleFactor: 2,
      relativeSpeed: 400,
    })
    await page.waitForTimeout(500)

    const zoomed = parseInt((await readout.textContent()) ?? '100', 10)
    expect(zoomed).toBeGreaterThan(100)
  })

  test('20.6 Calendar defaults to day view on a phone', async ({ vaultPage: page }) => {
    await mastheadNavigate(page, 'Organizer')
    await page.getByRole('button', { name: 'Calendar', exact: true }).tap()

    const dayBtn = page.getByRole('button', { name: 'day', exact: true })
    await expect(dayBtn).toBeVisible()
    expect((await dayBtn.getAttribute('class')) ?? '').toContain('bg-accent')
  })
})
