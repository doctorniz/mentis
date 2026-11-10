import type { Locator, Page } from '@playwright/test'
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
  await dialog.getByRole('button', { name: /^llama\.cpp/ }).click()
  await expect(dialog.getByRole('button', { name: 'Remove my-model.gguf' })).toBeVisible({
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
    const section = (dialog: Locator, label: string) =>
      dialog.getByRole('button', { name: new RegExp(`^${label}`) })

    test('14.1.0 Chat is off: only its switch is in Settings › AI', async ({ vaultPage: page }) => {
      const dialog = await openAISettings(page)
      await expect(dialog.getByRole('switch', { name: 'Chat' })).toHaveAttribute(
        'aria-checked',
        'false',
      )
      await expect(section(dialog, 'OpenAI')).toHaveCount(0)
    })

    test('14.1.1 On, the providers are a fixed list; no on-device model', async ({
      vaultPage: page,
    }) => {
      const dialog = await openAISettings(page)
      await dialog.getByRole('switch', { name: 'Chat' }).click()
      const names = await dialog.locator('[data-testid^="provider-"] > button').allInnerTexts()
      expect(names.map((n) => n.split('\n')[0])).toEqual([
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

      await section(dialog, 'OpenAI').click()
      await expect(dialog.getByLabel('OpenAI API key')).toBeVisible()
      await expect(dialog.getByText('API key', { exact: true })).toBeVisible()

      await section(dialog, 'llama.cpp').click()
      await expect(dialog.getByText('API key (optional)')).toBeVisible()
      await expect(dialog.getByLabel('llama.cpp address')).toHaveAttribute(
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
      await section(dialog, 'Ollama').click()

      await expect(dialog.getByText('2 available')).toBeVisible({ timeout: 10_000 })
      await expect(page.locator('datalist option')).toHaveCount(2)
      // Two to choose from: none is picked for the person.
      await expect(dialog.getByRole('button', { name: /^Remove / })).toHaveCount(0)

      // The server gains one; Refresh shows it.
      await serveJson(page, 'http://localhost:11434/v1/models', {
        data: [{ id: 'llama3.2:3b' }, { id: 'qwen3:8b' }, { id: 'gemma3:4b' }],
      })
      await dialog.getByRole('button', { name: 'Refresh models' }).click()
      await expect(dialog.getByText('3 available')).toBeVisible({ timeout: 10_000 })
    })

    test('14.1.4 A server with one model is chosen for you', async ({ vaultPage: page }) => {
      await serveJson(page, 'http://localhost:8080/v1/models', { data: [{ id: 'my-model.gguf' }] })
      const dialog = await openAISettings(page)
      await dialog.getByRole('switch', { name: 'Chat' }).click()
      await section(dialog, 'llama.cpp').click()
      await expect(dialog.getByRole('button', { name: 'Remove my-model.gguf' })).toBeVisible({
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
      await section(dialog, 'OpenAI').click()

      // No key yet: nothing to ask, nothing to offer.
      await expect(page.locator('datalist option')).toHaveCount(0)

      await dialog.getByLabel('OpenAI API key').fill('sk-test-123')
      await dialog.getByRole('button', { name: 'Test' }).click()
      await expect(dialog.getByText('Connected')).toBeVisible({ timeout: 10_000 })
      await expect(page.locator('datalist option')).toHaveCount(1)
      await expect(page.locator('datalist option')).toHaveAttribute('value', 'gpt-next')
      expect(seen.auth).toBe('Bearer sk-test-123')
    })

    test('14.1.6 An address belongs to its provider', async ({ vaultPage: page }) => {
      const dialog = await openAISettings(page)
      await dialog.getByRole('switch', { name: 'Chat' }).click()

      await section(dialog, 'Ollama').click()
      await dialog.getByLabel('Ollama address').fill('http://192.168.1.5:11434')
      await section(dialog, 'OpenAI').click()
      await expect(dialog.getByLabel('OpenAI address')).toHaveValue('')
      await section(dialog, 'Ollama').click()
      await expect(dialog.getByLabel('Ollama address')).toHaveValue('http://192.168.1.5:11434')
    })

    test('14.1.7 A failed list says why, and a model can still be typed', async ({
      vaultPage: page,
    }) => {
      await page.route('http://localhost:11434/v1/models', (route) =>
        route.abort('connectionrefused'),
      )
      const dialog = await openAISettings(page)
      await dialog.getByRole('switch', { name: 'Chat' }).click()
      await section(dialog, 'Ollama').click()
      await expect(
        dialog.getByText(/Cannot reach Ollama at http:\/\/localhost:11434\/v1/),
      ).toBeVisible({
        timeout: 10_000,
      })
      await dialog.getByLabel('Add a Ollama model').fill('my-own-model')
      await dialog.getByRole('button', { name: 'Add', exact: true }).click()
      await expect(dialog.getByRole('button', { name: 'Remove my-own-model' })).toBeVisible()
    })

    test('14.1.8 Models from two providers are kept, and one is in use', async ({
      vaultPage: page,
    }) => {
      await serveJson(page, 'http://localhost:11434/v1/models', { data: [] })
      await serveJson(page, 'http://localhost:8080/v1/models', { data: [] })
      const dialog = await openAISettings(page)
      await dialog.getByRole('switch', { name: 'Chat' }).click()

      await section(dialog, 'Ollama').click()
      await dialog.getByLabel('Add a Ollama model').fill('qwen3:8b')
      await dialog.getByRole('button', { name: 'Add', exact: true }).click()
      await section(dialog, 'llama.cpp').click()
      await dialog.getByLabel('Add a llama.cpp model').fill('my-model.gguf')
      await dialog.getByRole('button', { name: 'Add', exact: true }).click()

      // The first one added is in use until another is chosen.
      await expect(dialog.getByRole('button', { name: 'Use my-model.gguf' })).toHaveAttribute(
        'aria-pressed',
        'false',
      )
      await dialog.getByRole('button', { name: 'Use my-model.gguf' }).click()
      await expect(dialog.getByRole('button', { name: 'Use my-model.gguf' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await expect
        .poll(() => readVaultFile(page, '_mentis/config.json'), { timeout: 10_000 })
        .toMatch(/"picks"[\s\S]*qwen3:8b[\s\S]*my-model\.gguf/)

      // Removing the one in use leaves the other in use.
      await dialog.getByRole('button', { name: 'Remove my-model.gguf' }).click()
      await section(dialog, 'Ollama').click()
      await expect(dialog.getByRole('button', { name: 'Use qwen3:8b' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
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

    test('14.3.6 The model can be switched between messages', async ({ vaultPage: page }) => {
      const models: string[] = []
      await page.route('http://localhost:8080/v1/chat/completions', (route) => {
        const req = route.request()
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
        models.push((req.postDataJSON() as { model: string }).model)
        const chunk = JSON.stringify({ choices: [{ delta: { content: 'ok' } }] })
        return route.fulfill({
          status: 200,
          headers: { ...CORS, 'content-type': 'text/event-stream' },
          body: `data: ${chunk}

data: [DONE]

`,
        })
      })
      await setUpLocalChat(page)

      // A second model, added in Settings.
      const dialog = await openAISettings(page)
      await dialog.getByRole('button', { name: /^llama.cpp/ }).click()
      await dialog.getByLabel('Add a llama.cpp model').fill('second.gguf')
      await dialog.getByRole('button', { name: 'Add', exact: true }).click()
      await expect(dialog.getByRole('button', { name: 'Remove second.gguf' })).toBeVisible()
      await page.keyboard.press('Escape')

      await navigateTo(page, 'chat')
      const picker = page.getByRole('combobox', { name: 'Model' })
      await expect(picker).toHaveValue('llamacpp|my-model.gguf')
      await expect(picker.locator('option')).toHaveCount(2)

      const composer = page.locator('textarea').last()
      await composer.fill('first question')
      await composer.press('Enter')
      await expect.poll(() => models).toEqual(['my-model.gguf'])

      // Mid-conversation, and the composer stays open.
      await picker.selectOption('llamacpp|second.gguf')
      await expect(picker).toHaveValue('llamacpp|second.gguf')
      await expect
        .poll(() => readVaultFile(page, '_mentis/config.json'), { timeout: 10_000 })
        .toMatch(/"model": "second.gguf"/)
      await composer.fill('second question')
      await composer.press('Enter')
      await expect.poll(() => models).toEqual(['my-model.gguf', 'second.gguf'])
    })
  })

  test.describe('14.4 Context and usage', () => {
    test('14.4.1 The meter shows the window, then what a reply took', async ({
      vaultPage: page,
    }) => {
      await serveJson(page, 'http://localhost:8080/props', {
        default_generation_settings: { n_ctx: 8192 },
      })
      await page.route('http://localhost:8080/v1/chat/completions', (route) => {
        if (route.request().method() === 'OPTIONS') {
          return route.fulfill({ status: 204, headers: CORS })
        }
        const delta = JSON.stringify({ choices: [{ delta: { content: 'ok' } }] })
        const usage = JSON.stringify({
          choices: [],
          usage: { prompt_tokens: 120, completion_tokens: 7 },
        })
        return route.fulfill({
          status: 200,
          headers: { ...CORS, 'content-type': 'text/event-stream' },
          body: `data: ${delta}\n\ndata: ${usage}\n\ndata: [DONE]\n\n`,
        })
      })
      await setUpLocalChat(page)
      await navigateTo(page, 'chat')

      const meter = page.getByTestId('context-meter')
      await expect(meter).toContainText('0 / 8.2k', { timeout: 10_000 })

      const composer = page.locator('textarea').last()
      await composer.fill('how big is this')
      await composer.press('Enter')
      await expect(page.getByText('120 in · 7 out')).toBeVisible({ timeout: 10_000 })
      await expect(meter).toContainText('127 / 8.2k')
      await expect(meter).toHaveAttribute('title', /Thread so far: 120 in, 7 out/)
    })

    test('14.4.2 A window typed in Settings replaces the one reported', async ({
      vaultPage: page,
    }) => {
      await serveJson(page, 'http://localhost:8080/props', {
        default_generation_settings: { n_ctx: 8192 },
      })
      await setUpLocalChat(page)

      const dialog = await openAISettings(page)
      await dialog.getByRole('button', { name: /^llama\.cpp/ }).click()
      await expect(dialog.getByLabel('Context window of my-model.gguf')).toHaveAttribute(
        'placeholder',
        '8.2k',
      )
      await dialog.getByLabel('Context window of my-model.gguf').fill('4096')
      await expect
        .poll(() => readVaultFile(page, '_mentis/config.json'), { timeout: 10_000 })
        .toContain('"llamacpp|my-model.gguf": 4096')
      await page.keyboard.press('Escape')

      await navigateTo(page, 'chat')
      await expect(page.getByTestId('context-meter')).toContainText('0 / 4.1k', {
        timeout: 10_000,
      })
    })

    test('14.4.3 A window nobody reports shows tokens only', async ({ vaultPage: page }) => {
      await page.route('http://localhost:8080/props', (route) => route.abort('connectionrefused'))
      await setUpLocalChat(page)
      await navigateTo(page, 'chat')
      await expect(page.getByTestId('context-meter')).toHaveText('0 tokens', { timeout: 10_000 })
    })
  })

  test.describe('14.5 Long conversations', () => {
    test('14.5.1 Near the window, older messages are summarised and requests carry the summary', async ({
      vaultPage: page,
    }) => {
      type Wire = { role: string; content: string }
      const requests: Wire[][] = []
      await page.route('http://localhost:8080/v1/chat/completions', (route) => {
        const req = route.request()
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
        const messages = (req.postDataJSON() as { messages: Wire[] }).messages
        requests.push(messages)
        const summarising = messages[0]!.content.startsWith('You condense')
        const delta = JSON.stringify({
          choices: [{ delta: { content: summarising ? 'SUMMARY-OF-EARLIER' : 'an answer' } }],
        })
        const usage = JSON.stringify({
          choices: [],
          usage: { prompt_tokens: summarising ? 50 : 150, completion_tokens: 10 },
        })
        return route.fulfill({
          status: 200,
          headers: { ...CORS, 'content-type': 'text/event-stream' },
          body: `data: ${delta}\n\ndata: ${usage}\n\ndata: [DONE]\n\n`,
        })
      })
      await setUpLocalChat(page)

      // A small window, typed: 160 tokens is the line.
      const dialog = await openAISettings(page)
      await dialog.getByRole('button', { name: /^llama\.cpp/ }).click()
      await dialog.getByLabel('Context window of my-model.gguf').fill('200')
      await expect
        .poll(() => readVaultFile(page, '_mentis/config.json'), { timeout: 10_000 })
        .toContain('"llamacpp|my-model.gguf": 200')
      await page.keyboard.press('Escape')

      await navigateTo(page, 'chat')
      const composer = page.locator('textarea').last()
      const words = ['alpha', 'bravo', 'charlie', 'delta']
      for (const [i, w] of words.entries()) {
        await composer.fill(`question ${w}`)
        await composer.press('Enter')
        await expect
          .poll(() => requests.filter((r) => !r[0]!.content.startsWith('You condense')).length)
          .toBe(i + 1)
        await expect(page.getByText('150 in · 10 out')).toHaveCount(i + 1, { timeout: 10_000 })
      }

      // Three answers in, the fourth question tipped it: one summary, then the question.
      const summaries = requests.filter((r) => r[0]!.content.startsWith('You condense'))
      expect(summaries).toHaveLength(1)
      expect(summaries[0]![1]!.content).toContain('question alpha')

      await expect(page.getByTestId('summary-marker')).toBeVisible()
      const last = requests.at(-1)!
      expect(
        last.some((m) => m.role === 'system' && m.content.includes('SUMMARY-OF-EARLIER')),
      ).toBe(true)
      const asked = last.filter((m) => m.role === 'user').map((m) => m.content)
      expect(asked).not.toContain('question alpha')
      expect(asked.at(-1)).toBe('question delta')
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
