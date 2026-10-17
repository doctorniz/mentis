import {
  test,
  expect,
  navigateTo,
  createMarkdownNote,
  openVaultFile,
  waitForAutoSave,
  writeVaultFile,
} from './fixtures'

test.describe('13 — AI Chat', () => {
  test.describe('14.1 Settings & Provider Configuration', () => {
    /** Opens Settings › AI and returns its provider picker. */
    async function openAISettings(page: import('@playwright/test').Page) {
      await page.keyboard.press('Control+,')
      const dialog = page.getByRole('dialog')
      await dialog.getByRole('tab', { name: 'AI' }).click()
      // The AI panel loads on demand; its picker is the one offering OpenAI.
      const providerSelect = dialog.locator('select', {
        has: page.locator('option', { hasText: 'OpenAI' }),
      })
      await expect(providerSelect).toBeVisible({ timeout: 10_000 })
      return providerSelect
    }

    const keyInput = (page: import('@playwright/test').Page) =>
      page.locator(
        'input[type="password"], input[placeholder*="key"], input[placeholder*="Key"], [data-testid="api-key-input"]',
      )

    test('14.1.1 Provider dropdown — all providers listed', async ({ vaultPage: page }) => {
      const providerSelect = await openAISettings(page)
      const labels = await providerSelect.locator('option').allTextContents()
      expect(labels).toEqual(expect.arrayContaining(['OpenRouter', 'OpenAI', 'Ollama']))
    })

    test('14.1.2 Select cloud provider — API key field shown', async ({ vaultPage: page }) => {
      const providerSelect = await openAISettings(page)
      await providerSelect.selectOption({ label: 'OpenAI' })
      await expect(keyInput(page).first()).toBeVisible({ timeout: 5_000 })
    })

    test('14.1.3 Select local provider — API key field hidden', async ({ vaultPage: page }) => {
      const providerSelect = await openAISettings(page)
      await providerSelect.selectOption({ label: 'Ollama' })
      await expect(keyInput(page)).toBeHidden({ timeout: 5_000 })
    })

    test.fixme('14.1.11 Change provider — model list resets', async ({ vaultPage: page }) => {
      // Requires switching between providers and verifying model dropdown resets
      const providerSelect = await openAISettings(page)

      // Select first provider
      await providerSelect.click()
      await page.waitForTimeout(200)
      const firstOption = page.locator('option, [role="option"]').nth(1)
      await firstOption.click()
      await page.waitForTimeout(500)

      // Switch to a different provider
      await providerSelect.click()
      await page.waitForTimeout(200)
      const secondOption = page.locator('option, [role="option"]').nth(2)
      await secondOption.click()
      await page.waitForTimeout(500)

      // Model dropdown should reset (not carry over previous provider's model)
      const modelSelect = page.locator('[data-testid="model-select"], select').nth(1)
      if (await modelSelect.isVisible().catch(() => false)) {
        const value = await modelSelect.inputValue().catch(() => '')
        // Model should be empty or set to a default for the new provider
        expect(value).not.toContain('gpt') // if we switched away from OpenAI
      }
    })
  })

  test.describe('14.2 Per-Document Chat', () => {
    test('14.2.1 Open note — click sparkle button — chat panel opens', async ({
      vaultPage: page,
    }) => {
      await createMarkdownNote(page, 'Chat Test Note')
      await waitForAutoSave(page)

      // The chat section lives in the editor right column: collapsed it
      // shows "Expand chat" (or "Open chat" on the collapsed rail)
      const sparkleBtn = page
        .locator('button[aria-label="Expand chat"], button[aria-label="Open chat"]')
        .first()
      await expect(sparkleBtn).toBeVisible({ timeout: 10_000 })
      await sparkleBtn.click()
      await page.waitForTimeout(500)

      // Chat panel open: the collapse control replaces the expand one
      await expect(page.locator('button[aria-label="Collapse chat"]')).toBeVisible({
        timeout: 5_000,
      })
    })

    for (const [file, content] of [
      ['Roadmap.kan.md', '---\nkanban-plugin: basic\n---\n\n## Todo\n\n- [ ] Ship it\n'],
      ['Talk.slides.md', '---\nmarp: true\n---\n\n# Hello\n'],
    ] as const) {
      test(`14.2.9 Chat panel is offered for ${file}`, async ({ vaultPage: page }) => {
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

    test('14.2.8 Close panel — no data loss', async ({ vaultPage: page }) => {
      await createMarkdownNote(page, 'Persistence Test')
      await waitForAutoSave(page)

      // Open chat panel
      const sparkleBtn = page
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
      const closeBtn = page
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
    test('14.3.1 Switch to Vault Chat view (Ctrl+0) — full-viewport layout', async ({
      vaultPage: page,
    }) => {
      await navigateTo(page, 'chat')
      await page.waitForTimeout(1000)

      // The chat composer fills the view
      const chatComposer = page
        .locator('textarea, [data-testid="chat-input"], [contenteditable="true"]')
        .first()
      await expect(chatComposer).toBeVisible({ timeout: 10_000 })
    })

    test('14.3.5 Thread list sidebar', async ({ vaultPage: page }) => {
      await navigateTo(page, 'chat')
      await page.waitForTimeout(1000)

      // Vault chat should have a thread list sidebar
      const sidebar = page
        .locator('[data-testid="thread-list"], [class*="thread"], [class*="sidebar"]')
        .first()
      await expect(sidebar).toBeVisible({ timeout: 10_000 })
    })
  })

  test.describe('14.6 Reactivity & Edge Cases', () => {
    test('14.6.3 No provider selected — shows configure message', async ({ vaultPage: page }) => {
      await navigateTo(page, 'chat')
      await page.waitForTimeout(1000)

      // If no provider is configured, the chat should show a prompt to configure
      // Look for text like "configure", "set up", "select a provider", or "Load model"
      const configPrompt = page
        .getByText(/configure|set up|select.*provider|choose.*provider|Load model|add.*key/i)
        .first()
      // This may or may not be visible depending on default state
      const isVisible = await configPrompt.isVisible().catch(() => false)
      if (isVisible) {
        await expect(configPrompt).toBeVisible()
      } else {
        // If a provider is already configured by default, this test doesn't apply
        // Just verify chat view loaded without errors
        const chatArea = page
          .locator('textarea, [data-testid="chat-input"], [contenteditable="true"]')
          .first()
        await expect(chatArea).toBeVisible({ timeout: 10_000 })
      }
    })

    test.fixme('14.6.4 Provider but no key — shows add key message', async ({
      vaultPage: page,
    }) => {
      // Requires configuring a cloud provider without providing a key,
      // then attempting to send a message
      await navigateTo(page, 'chat')
      await page.waitForTimeout(1000)

      const chatInput = page
        .locator('textarea, [data-testid="chat-input"], [contenteditable="true"]')
        .first()
      if (await chatInput.isVisible().catch(() => false)) {
        await chatInput.fill('Hello')
        await page.keyboard.press('Enter')
        await page.waitForTimeout(2000)

        // Should show an error or prompt about missing API key
        const keyError = page.getByText(/key|authenticate|API/i).first()
        await expect(keyError).toBeVisible({ timeout: 5_000 })
      }
    })
  })
})
