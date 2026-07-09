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

/**
 * Navigate to a view the way the current nav actually works:
 * Ctrl+0 Chat · Ctrl+1 Vault · Ctrl+2 Board · Ctrl+3 Organizer
 * (Tasks / Lists / Calendar / Reminders sub-tabs) · Ctrl+4 Bookmarks ·
 * Ctrl+5 Files. Graph opens from inside Vault; Search is Vault's left
 * search panel (Ctrl+F).
 */
export async function navigateTo(page: Page, view: ViewName) {
  switch (view) {
    case 'chat':
      await page.keyboard.press('Control+0')
      break
    case 'vault':
      await page.keyboard.press('Control+1')
      break
    case 'board':
      await page.keyboard.press('Control+2')
      break
    case 'tasks':
      await page.keyboard.press('Control+3')
      await page.getByRole('button', { name: 'Tasks', exact: true }).first().click()
      break
    case 'calendar':
      await page.keyboard.press('Control+3')
      await page.getByRole('button', { name: 'Calendar', exact: true }).first().click()
      break
    case 'bookmarks':
      await page.keyboard.press('Control+4')
      break
    case 'files':
      await page.keyboard.press('Control+5')
      break
    case 'graph':
      await page.keyboard.press('Control+1')
      await page.locator('[aria-label="Open graph"]').first().click()
      break
    case 'search':
      // Search lives in Vault's left panel. Click the tree/rail button
      // rather than pressing Ctrl+F — with focus inside the note editor,
      // Ctrl+F opens the in-note find bar instead (by design).
      await page.keyboard.press('Control+1')
      await page.locator('button[aria-label="Search vault"]').first().click()
      break
  }
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

/**
 * Open a file from the Vault file tree by its stem (basename without
 * extension). Scoped to the tree so nav items with similar labels
 * (e.g. "Board") can't be matched by accident.
 */
export async function openVaultFile(page: Page, filename: string) {
  await navigateTo(page, 'vault')
  const stem = filename.replace(/\.[^/.]+$/, '')
  const tree = page.getByRole('tree', { name: 'Vault file tree' })
  await tree.getByRole('button', { name: stem, exact: true }).first().click()
  await page.waitForTimeout(1000)
}

/**
 * Write a file into the active OPFS vault, creating intermediate folders.
 *
 * Vaults live at `vaults/<slug>-<random>` in OPFS — the folder name is NOT
 * the display name, so specs can't address it statically; this finds the
 * first (only) vault directory. Dispatches `ink:vault-changed` so the
 * tree/search/graph pick the file up.
 *
 * `content` is UTF-8 text unless `opts.base64` is set (binary payloads:
 * PDFs, images).
 */
export async function writeVaultFile(
  page: Page,
  relPath: string,
  content: string,
  opts?: { base64?: boolean },
) {
  await page.evaluate(
    async ({ relPath, content, isBase64 }) => {
      const root = await navigator.storage.getDirectory()
      const vaultsDir = await root.getDirectoryHandle('vaults')
      let vaultDir: FileSystemDirectoryHandle | null = null
      const iter = (vaultsDir as unknown as { values(): AsyncIterable<FileSystemHandle> }).values()
      for await (const entry of iter) {
        if (entry.kind === 'directory') {
          vaultDir = entry as FileSystemDirectoryHandle
          break
        }
      }
      if (!vaultDir) throw new Error('No vault directory found under vaults/')

      const parts = relPath.split('/')
      const fileName = parts.pop()!
      let dir = vaultDir
      for (const part of parts) {
        dir = await dir.getDirectoryHandle(part, { create: true })
      }
      const fh = await dir.getFileHandle(fileName, { create: true })
      const writable = await fh.createWritable()
      if (isBase64) {
        await writable.write(Uint8Array.from(atob(content), (c) => c.charCodeAt(0)))
      } else {
        await writable.write(content)
      }
      await writable.close()
    },
    { relPath, content, isBase64: opts?.base64 ?? false },
  )
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('ink:vault-changed')))
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
