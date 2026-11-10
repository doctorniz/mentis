import type { Page } from '@playwright/test'
import {
  test,
  expect,
  navigateTo,
  createMarkdownNote,
  enableChat,
  openVaultFile,
  readVaultFile,
  waitForAutoSave,
  writeVaultFile,
} from './fixtures'

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }

/** Answer `GET url` (and its CORS preflight) with this JSON. */
async function serveJson(page: Page, url: string, body: unknown, seen?: { auth?: string }) {
  await page.route(url, (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (seen) seen.auth = req.headers()['authorization']
    return route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  })
}

/** Chat on, with a llama.cpp server (mocked) offering one model: a composer that works. */
async function setUpLocalChat(page: Page) {
  await serveJson(page, 'http://localhost:8080/v1/models', { data: [{ id: 'my-model.gguf' }] })
  await page.keyboard.press('Control+,')
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  await dialog.getByRole('tab', { name: 'AI' }).click()
  await dialog.getByRole('switch', { name: 'Chat' }).click()
  await dialog.getByRole('combobox', { name: 'Provider' }).selectOption({ label: 'llama.cpp' })
  await expect(dialog.getByLabel('Model', { exact: true })).toHaveValue('my-model.gguf', {
    timeout: 10_000,
  })
  await expect
    .poll(() => readVaultFile(page, '_mentis/config.json'), { timeout: 10_000 })
    .toContain('my-model.gguf')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
}

test.describe('13 — AI Chat', () => {
  /** Opens Settings › AI. */
  async function openAISettings(page: Page) {
    await page.keyboard.press('Control+,')
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await dialog.getByRole('tab', { name: 'AI' }).click()
    await expect(dialog.getByRole('switch', { name: 'Chat' })).toBeVisible({ timeout: 10_000 })
    return dialog
  }

  test.describe('14.1 Off by default, and Settings', () => {
    test('14.1.0 Chat is off: only its switch is in Settings › AI', async ({ vaultPage: page }) => {
      const dialog = await openAISettings(page)
      await expect(dialog.getByRole('switch', { name: 'Chat' })).toHaveAttribute(
        'aria-checked',
        'false',
      )
      await expect(dialog.getByRole('combobox', { name: 'Provider' })).toHaveCount(0)
    })

    test('14.1.1 On, the providers are a fixed list; no on-device model', async ({
      vaultPage: page,
    }) => {
      const dialog = await openAISettings(page)
      await dialog.getByRole('switch', { name: 'Chat' }).click()
      const labels = await dialog
        .getByRole('combobox', { name: 'Provider' })
        .locator('option')
        .allTextContents()
      expect(labels).toEqual([
        'Choose…',
        'OpenRouter',
        'Anthropic',
        'OpenAI',
        'Google Gemini',
        'Ollama',
        'llama.cpp',
      ])
    })

    test('14.1.2 A cloud provider asks for a key; a local one makes it optional', async ({
      vaultPage: page,
    }) => {
      const dialog = await openAISettings(page)
      await dialog.getByRole('switch', { name: 'Chat' }).click()
      const provider = dialog.getByRole('combobox', { name: 'Provider' })
      const key = dialog.getByLabel('API key')

      await provider.selectOption({ label: 'OpenAI' })
      await expect(key).toBeVisible()
      await expect(dialog.getByText('API key', { exact: true })).toBeVisible()

      await provider.selectOption({ label: 'llama.cpp' })
      await expect(dialog.getByText('API key (optional)')).toBeVisible()
      await expect(dialog.getByLabel('Base URL')).toHaveAttribute(
        'placeholder',
        'http://localhost:8080',
      )
    })

    test('14.1.3 Models are fetched from the local server, not listed in the app', async ({
      vaultPage: page,
    }) => {
      await serveJson(page, 'http://localhost:11434/v1/models', {
        data: [{ id: 'llama3.2:3b' }, { id: 'qwen3:8b' }],
      })
      const dialog = await openAISettings(page)
      await dialog.getByRole('switch', { name: 'Chat' }).click()
      await dialog.getByRole('combobox', { name: 'Provider' }).selectOption({ label: 'Ollama' })

      await expect(dialog.getByText('2 models')).toBeVisible({ timeout: 10_000 })
      await expect(page.locator('datalist option')).toHaveCount(2)
      // Two to choose from: none is picked for the person.
      await expect(dialog.getByLabel('Model', { exact: true })).toHaveValue('')

      // The server gains one; Refresh shows it.
      await serveJson(page, 'http://localhost:11434/v1/models', {
        data: [{ id: 'llama3.2:3b' }, { id: 'qwen3:8b' }, { id: 'gemma3:4b' }],
      })
      await dialog.getByRole('button', { name: 'Refresh models' }).click()
      await expect(dialog.getByText('3 models')).toBeVisible({ timeout: 10_000 })
    })

    test('14.1.4 A server with one model is chosen for you', async ({ vaultPage: page }) => {
      await serveJson(page, 'http://localhost:8080/v1/models', { data: [{ id: 'my-model.gguf' }] })
      const dialog = await openAISettings(page)
      await dialog.getByRole('switch', { name: 'Chat' }).click()
      await dialog.getByRole('combobox', { name: 'Provider' }).selectOption({ label: 'llama.cpp' })
      await expect(dialog.getByLabel('Model', { exact: true })).toHaveValue('my-model.gguf', {
        timeout: 10_000,
      })
    })

    test('14.1.5 A cloud list is fetched with the key, and only chat models are offered', async ({
      vaultPage: page,
    }) => {
      const seen: { auth?: string } = {}
      await serveJson(
        page,
        'https://api.openai.com/v1/models',
        { data: [{ id: 'text-embedding-3-large' }, { id: 'gpt-next' }, { id: 'whisper-1' }] },
        seen,
      )
      const dialog = await openAISettings(page)
      await dialog.getByRole('switch', { name: 'Chat' }).click()
      await dialog.getByRole('combobox', { name: 'Provider' }).selectOption({ label: 'OpenAI' })

      // No key yet: nothing to ask, nothing to offer.
      await expect(page.locator('datalist option')).toHaveCount(0)

      await dialog.getByLabel('API key').fill('sk-test-123')
      await dialog.getByRole('button', { name: 'Test' }).click()
      await expect(dialog.getByText('Connected')).toBeVisible({ timeout: 10_000 })
      await expect(page.locator('datalist option')).toHaveCount(1)
      await expect(page.locator('datalist option')).toHaveAttribute('value', 'gpt-next')
      expect(seen.auth).toBe('Bearer sk-test-123')
    })

    test('14.1.6 An address belongs to its provider', async ({ vaultPage: page }) => {
      const dialog = await openAISettings(page)
      await dialog.getByRole('switch', { name: 'Chat' }).click()
      const provider = dialog.getByRole('combobox', { name: 'Provider' })
      const base = dialog.getByLabel('Base URL')

      await provider.selectOption({ label: 'Ollama' })
      await base.fill('http://192.168.1.5:11434')
      await provider.selectOption({ label: 'OpenAI' })
      await expect(base).toHaveValue('')
      await provider.selectOption({ label: 'Ollama' })
      await expect(base).toHaveValue('http://192.168.1.5:11434')
    })

    test('14.1.7 A failed list says why, and the model can still be typed', async ({
      vaultPage: page,
    }) => {
      await page.route('http://localhost:11434/v1/models', (route) =>
        route.abort('connectionrefused'),
      )
      const dialog = await openAISettings(page)
      await dialog.getByRole('switch', { name: 'Chat' }).click()
      await dialog.getByRole('combobox', { name: 'Provider' }).selectOption({ label: 'Ollama' })
      await expect(
        dialog.getByText(/Cannot reach Ollama at http:\/\/localhost:11434\/v1/),
      ).toBeVisible({
        timeout: 10_000,
      })
      await dialog.getByLabel('Model', { exact: true }).fill('my-own-model')
      await expect(dialog.getByLabel('Model', { exact: true })).toHaveValue('my-own-model')
    })
  })

  test.describe('14.2 Per-Document Chat', () => {
    test('14.2.0 Off, opening a note does not write to it and shows no chat', async ({
      vaultPage: page,
    }) => {
      const before = await readVaultFile(page, 'Welcome.md')
      expect(before).not.toBe('')
      await openVaultFile(page, 'Welcome.md')
      await expect(page.locator('.tiptap').first()).toBeVisible({ timeout: 15_000 })
      await page.waitForTimeout(3000)

      expect(await readVaultFile(page, 'Welcome.md')).toBe(before)
      expect(await readVaultFile(page, 'Welcome.md')).not.toContain('chatAssetId')
      await expect(
        page.locator('button[aria-label="Expand chat"], button[aria-label="Open chat"]'),
      ).toHaveCount(0)
    })

    test('14.2.1 On: open note — chat panel opens', async ({ vaultPage: page }) => {
      await enableChat(page)
      await createMarkdownNote(page, 'Chat Test Note')
      await waitForAutoSave(page)

      // The chat section lives in the editor right column: collapsed it
      // shows "Expand chat" (or "Open chat" on the collapsed rail)
      const sparkleBtn = page
        .locator('button[aria-label="Expand chat"], button[aria-label="Open chat"]')
        .first()
      await expect(sparkleBtn).toBeVisible({ timeout: 10_000 })
      await sparkleBtn.click()

      // Chat panel open: the collapse control replaces the expand one
      await expect(page.locator('button[aria-label="Collapse chat"]')).toBeVisible({
        timeout: 5_000,
      })
    })

    for (const [file, content] of [
      ['Roadmap.kan.md', '---\nkanban-plugin: basic\n---\n\n## Todo\n\n- [ ] Ship it\n'],
      ['Talk.slides.md', '---\nmarp: true\n---\n\n# Hello\n'],
    ] as const) {
      test(`14.2.9 Chat panel is offered for ${file} once on`, async ({ vaultPage: page }) => {
        await enableChat(page)
        await writeVaultFile(page, file, content)
        await openVaultFile(page, file)
        const expand = page
          .locator('button[aria-label="Expand chat"], button[aria-label="Open chat"]')
          .first()
        await expect(expand).toBeVisible({ timeout: 10_000 })
        await expand.click()
        await expect(page.locator('button[aria-label="Collapse chat"]')).toBeVisible({
          timeout: 5_000,
        })
      })
    }

    test('14.2.10 Switching chat off takes the panel away again', async ({ vaultPage: page }) => {
      await enableChat(page)
      await openVaultFile(page, 'Welcome.md')
      const expand = page
        .locator('button[aria-label="Expand chat"], button[aria-label="Open chat"]')
        .first()
      await expect(expand).toBeVisible({ timeout: 10_000 })

      const dialog = await openAISettings(page)
      await dialog.getByRole('switch', { name: 'Chat' }).click()
      await expect(dialog.getByRole('switch', { name: 'Chat' })).toHaveAttribute(
        'aria-checked',
        'false',
      )
      await page.keyboard.press('Escape')
      await expect(expand).toHaveCount(0)
    })

    test('14.2.8 Close panel — no data loss', async ({ vaultPage: page }) => {
      await setUpLocalChat(page)
      await createMarkdownNote(page, 'Persistence Test')
      await waitForAutoSave(page)

      // Open chat panel
      const main = page.getByRole('main')
      const sparkleBtn = main
        .locator(
          'button[aria-label*="hat"], button[aria-label*="parkle"], button[aria-label*="AI"], [data-testid="chat-toggle"]',
        )
        .first()
      if (await sparkleBtn.isVisible().catch(() => false)) {
        await sparkleBtn.click()
        await page.waitForTimeout(500)
      }

      // Type something in chat input (but don't send — test draft preservation)
      const chatInput = page
        .locator('[data-testid="chat-input"], textarea, [contenteditable="true"]')
        .last()
      if (await chatInput.isVisible().catch(() => false)) {
        await chatInput.click()
        await chatInput.fill('Test message draft')
        await page.waitForTimeout(300)
      }

      // Close chat panel
      const closeBtn = main
        .locator('[data-testid="chat-close"], button[aria-label*="lose"]')
        .first()
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click()
      } else {
        // Try clicking the sparkle button again to toggle off
        await sparkleBtn.click()
      }
      await page.waitForTimeout(300)

      // Editor content should still be intact
      const editor = page.locator('.tiptap, .ProseMirror').first()
      await expect(editor).toContainText('Persistence Test')
    })
  })

  test.describe('14.3 Vault-Wide Chat', () => {
    test('14.3.1 Switch to Vault Chat view (Ctrl+2) — full-viewport layout', async ({
      vaultPage: page,
    }) => {
      await enableChat(page)
      await navigateTo(page, 'chat')

      // The chat composer fills the view
      const chatComposer = page
        .locator('textarea, [data-testid="chat-input"], [contenteditable="true"]')
        .first()
      await expect(chatComposer).toBeVisible({ timeout: 10_000 })
    })

    test('14.3.5 Thread list sidebar', async ({ vaultPage: page }) => {
      await enableChat(page)
      await navigateTo(page, 'chat')

      // Vault chat should have a thread list sidebar
      const sidebar = page
        .locator('[data-testid="thread-list"], [class*="thread"], [class*="sidebar"]')
        .first()
      await expect(sidebar).toBeVisible({ timeout: 10_000 })
    })
  })

  test.describe('14.6 Reactivity & Edge Cases', () => {
    test('14.6.3 On, with no provider chosen — says to choose one', async ({ vaultPage: page }) => {
      await enableChat(page)
      await navigateTo(page, 'chat')
      await expect(page.getByPlaceholder('Choose a provider in Settings → AI')).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.locator('textarea').first()).toBeDisabled()
    })
  })
})
