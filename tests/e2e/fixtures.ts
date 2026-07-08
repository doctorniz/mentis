import { test as base, expect, type Page } from '@playwright/test'

/**
 * Shared fixtures for Mentis E2E tests.
 *
 * Provides a seeded vault in OPFS so every test starts with a known state.
 * The vault is created fresh for each test to avoid cross-contamination.
 */

const TEST_VAULT_NAME = 'E2E Test Vault'

export const test = base.extend<{
  vaultPage: Page
}>({
  vaultPage: async ({ page }, use) => {
    await page.goto('/')
    await seedVault(page)
    await use(page)
  },
})

export { expect }

/** Seeds a fresh vault via OPFS and waits for the app to be ready. */
async function seedVault(page: Page) {
  await page.waitForLoadState('domcontentloaded')

  // The app is client-rendered: right after domcontentloaded the React
  // tree may not exist yet, so a bare isVisible() check races the render.
  // Wait until either the vault landing (fresh state) or the app shell's
  // sidebar (auto-restored vault) is actually on screen, then branch.
  const landingForm = page.locator('form').filter({
    has: page.getByRole('button', { name: /create/i }),
  })
  const sidebar = page.locator('[data-testid="main-sidebar"], nav')
  await expect(landingForm.or(sidebar).first()).toBeVisible({ timeout: 30_000 })

  if (await landingForm.isVisible()) {
    const nameInput = landingForm.getByRole('textbox')
    await nameInput.clear()
    await nameInput.fill(TEST_VAULT_NAME)
    await landingForm.getByRole('button', { name: /create/i }).click()
  }

  // Wait for app shell to be ready (sidebar visible = vault loaded)
  await page.waitForSelector('[data-testid="main-sidebar"], nav', { timeout: 30_000 })
}

/** Navigate to a specific view via keyboard shortcut. */
export async function navigateTo(page: Page, view: ViewName) {
  const shortcuts: Record<ViewName, string> = {
    chat: 'Control+0',
    vault: 'Control+1',
    board: 'Control+2',
    tasks: 'Control+3',
    bookmarks: 'Control+4',
    calendar: 'Control+5',
    graph: 'Control+6',
    files: 'Control+7',
    search: 'Control+8',
  }
  await page.keyboard.press(shortcuts[view])
  await page.waitForTimeout(500)
}

export type ViewName =
  | 'chat'
  | 'vault'
  | 'board'
  | 'tasks'
  | 'bookmarks'
  | 'calendar'
  | 'graph'
  | 'files'
  | 'search'

/** Create a new markdown note via the sidebar's "Note" quick action. */
export async function createMarkdownNote(page: Page, title?: string) {
  const noteBtn = page.getByRole('button', { name: 'Note', exact: true }).first()
  if (await noteBtn.isVisible().catch(() => false)) {
    await noteBtn.click()
  } else {
    // Fallback: Ctrl+N popover (older layout)
    await page.keyboard.press('Control+n')
    await page.waitForTimeout(300)
    const mdOption = page.getByText(/^(Note|Markdown)$/i).first()
    if (await mdOption.isVisible()) {
      await mdOption.click()
    }
  }

  // The editor mounts once the new file's tab opens.
  await page.locator('.tiptap').first().waitFor({ state: 'visible', timeout: 15_000 })

  if (title) {
    const editor = page.locator('.tiptap').first()
    await editor.click()
    await editor.pressSequentially(title)
  }

  await page.waitForTimeout(1000) // wait for auto-save
}

/** Open a view and wait for it to stabilize. */
export async function waitForView(page: Page, view: ViewName) {
  await navigateTo(page, view)
  await page.waitForTimeout(800)
}

/** Type in the active editor. */
export async function typeInEditor(page: Page, text: string) {
  const editor = page.locator('.tiptap, .ProseMirror').first()
  await editor.click()
  await editor.pressSequentially(text)
}

/** Wait for a toast message to appear. */
export async function waitForToast(page: Page, text: string | RegExp) {
  await page.waitForSelector(`[data-testid="toast"], [role="status"]`, { timeout: 5_000 })
  if (typeof text === 'string') {
    await expect(page.getByText(text)).toBeVisible({ timeout: 5_000 })
  }
}

/** Dismiss all visible toasts. */
export async function dismissToasts(page: Page) {
  const closeButtons = page.locator('[data-testid="toast"] button, [role="status"] button')
  const count = await closeButtons.count()
  for (let i = 0; i < count; i++) {
    await closeButtons
      .nth(i)
      .click()
      .catch(() => {})
  }
}

/** Wait for auto-save to complete (debounce + flush). */
export async function waitForAutoSave(page: Page) {
  await page.waitForTimeout(2000)
}
