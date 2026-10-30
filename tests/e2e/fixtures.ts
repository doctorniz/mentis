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
  cspViolations: void
}>({
  vaultPage: async ({ page }, use) => {
    await page.goto('/')
    await seedVault(page)
    await use(page)
  },
  // Served with the deployed content security policy (CI), anything the
  // policy blocks fails the test that triggered it.
  cspViolations: [
    async ({ context }, use) => {
      const violations: string[] = []
      const watch = (page: Page) =>
        page.on('console', (msg) => {
          if (msg.text().includes('Content Security Policy')) violations.push(msg.text())
        })
      context.pages().forEach(watch)
      context.on('page', watch)
      await use()
      expect(violations, 'blocked by the content security policy').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

/** Seeds a fresh vault via OPFS and waits for the app to be ready. */
async function seedVault(page: Page) {
  await page.waitForLoadState('domcontentloaded')

  // The app is client-rendered: right after domcontentloaded the React
  // tree may not exist yet, so a bare isVisible() check races the render.
  // Wait until either the vault landing (fresh state) or the app shell
  // (auto-restored vault) is actually on screen, then branch. On mobile
  // viewports the nav sidebar is display:none — the masthead is the
  // ready signal instead.
  // `:visible` matters: on mobile the desktop nav is display:none but
  // still in the DOM, and a bare comma-selector wait would latch onto
  // that first (hidden) match and hang.
  const SHELL_SELECTOR =
    '[data-testid="main-sidebar"]:visible, nav:visible, [data-testid="mobile-masthead"]:visible'
  const landingForm = page.locator('form').filter({
    has: page.getByRole('button', { name: /create/i }),
  })
  const shell = page.locator(SHELL_SELECTOR)
  await expect(landingForm.or(shell).first()).toBeVisible({ timeout: 30_000 })

  if (await landingForm.isVisible()) {
    const nameInput = landingForm.getByRole('textbox')
    await nameInput.clear()
    await nameInput.fill(TEST_VAULT_NAME)
    await landingForm.getByRole('button', { name: /create/i }).click()
  }

  // Wait for app shell to be ready (nav sidebar on desktop, masthead on mobile)
  await page.waitForSelector(SHELL_SELECTOR, { timeout: 30_000 })
}

/** Run a command palette entry by its title ("Go to Vault"). */
export async function runCommand(page: Page, title: string) {
  await page.keyboard.press('Control+k')
  await page.getByRole('textbox', { name: 'Command or file name' }).fill(title)
  await page
    .getByRole('option', { name: new RegExp(`^${title}`) })
    .first()
    .click()
}

/**
 * Navigate to a view the way the current nav actually works. The sidebar
 * lists Today (Ctrl+1), Chat (2), Calendar (3), Tasks (4), Thoughts (5) and
 * Bookmarks (6), then the file tree; Tasks and Calendar keep Lists and
 * Reminders as tabs. The vault view (the editor) and Files are reached from
 * the palette, Graph from the tree's heading, Search from the sidebar.
 */
export async function navigateTo(page: Page, view: ViewName) {
  switch (view) {
    case 'chat':
      await page.keyboard.press('Control+2')
      break
    case 'vault':
      await runCommand(page, 'Go to Vault')
      break
    case 'board':
      await page.keyboard.press('Control+5')
      break
    case 'tasks':
      await page.keyboard.press('Control+4')
      await page.getByRole('button', { name: 'All tasks', exact: true }).click()
      break
    case 'calendar':
      await page.keyboard.press('Control+3')
      // The view's own tab; on a phone the tab bar's Calendar (after it) matches too.
      await page
        .getByRole('main')
        .getByRole('button', { name: 'Calendar', exact: true })
        .first()
        .click()
      break
    case 'bookmarks':
      await page.keyboard.press('Control+6')
      break
    case 'files':
      await runCommand(page, 'Go to Files')
      break
    case 'graph':
      await page.locator('[aria-label="Open graph"]').first().click()
      break
    case 'search':
      // Click the sidebar's Search rather than pressing Ctrl+F — with focus
      // inside the note editor, Ctrl+F opens the in-note find bar instead.
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
  // The tree shows titles without the type's suffix. Compound suffixes
  // (mirroring the registered .kan.md / .map.md / .slides.md / .list.md) go whole.
  const stem = filename.replace(/\.(kan|map|slides|list)\.md$/i, '').replace(/\.[^/.]+$/, '')
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

/** A vault file's text, read straight from OPFS; '' while the app is writing
 *  it (OPFS refuses the read), so `expect.poll` tries again. */
export async function readVaultFile(page: Page, relPath: string) {
  return page.evaluate(async (relPath) => {
    try {
      const root = await navigator.storage.getDirectory()
      const vaults = await root.getDirectoryHandle('vaults')
      const iter = (vaults as unknown as { values(): AsyncIterable<FileSystemHandle> }).values()
      let dir: FileSystemDirectoryHandle | null = null
      for await (const e of iter) if (e.kind === 'directory') dir = e as FileSystemDirectoryHandle
      const parts = relPath.split('/')
      const name = parts.pop()!
      for (const part of parts) dir = await dir!.getDirectoryHandle(part)
      return await (await (await dir!.getFileHandle(name)).getFile()).text()
    } catch {
      return ''
    }
  }, relPath)
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
