import { test, expect, navigateTo, createMarkdownNote } from './fixtures'

/**
 * E2E coverage for the markdown editor improvement batch:
 * find/replace, headings outline, mode-switch scroll preservation,
 * table controls, word count, and the CodeMirror source mode.
 */
test.describe('Markdown Editor Extras', () => {
  test.beforeEach(async ({ vaultPage: page }) => {
    await navigateTo(page, 'vault')
    await createMarkdownNote(page)
  })

  // ── 18.1 Find / replace ─────────────────────────────────────────────

  test.describe('18.1 Find and replace', () => {
    test('18.1.1 Ctrl+F opens the in-note find bar, not vault search', async ({
      vaultPage: page,
    }) => {
      const editor = page.locator('.tiptap').first()
      await editor.click()
      await page.keyboard.type('the quick brown fox')
      await page.keyboard.press('Control+f')

      const findBar = page.locator('[role="search"][aria-label="Find in note"]')
      await expect(findBar).toBeVisible()
      // Editor is still on screen — the global vault-search view did not hijack.
      await expect(editor).toBeVisible()
    })

    test('18.1.2 Matches highlight with a count; Enter cycles', async ({ vaultPage: page }) => {
      const editor = page.locator('.tiptap').first()
      await editor.click()
      await page.keyboard.type('alpha beta alpha gamma alpha')
      await page.keyboard.press('Control+f')

      const findInput = page.getByRole('textbox', { name: 'Find', exact: true })
      await findInput.fill('alpha')

      await expect(editor.locator('.find-match')).toHaveCount(3)
      const findBar = page.locator('[role="search"][aria-label="Find in note"]')
      await expect(findBar).toContainText('1/3')

      await findInput.press('Enter')
      await expect(findBar).toContainText('2/3')
      await findInput.press('Enter')
      await expect(findBar).toContainText('3/3')
      await findInput.press('Enter') // wraps
      await expect(findBar).toContainText('1/3')
    })

    test('18.1.3 Replace one and replace all', async ({ vaultPage: page }) => {
      const editor = page.locator('.tiptap').first()
      await editor.click()
      await page.keyboard.type('alpha beta alpha')
      await page.keyboard.press('Control+f')

      await page.getByRole('textbox', { name: 'Find', exact: true }).fill('alpha')
      // The collapsed toggle chip is labeled "Replace"; once expanded it
      // becomes "Hide replace", leaving the action button as the only
      // exact "Replace" match.
      await page.getByRole('button', { name: 'Replace', exact: true }).click()

      const replaceInput = page.getByRole('textbox', { name: 'Replace with' })
      await replaceInput.fill('gamma')
      await page.getByRole('button', { name: 'Replace', exact: true }).click()
      await expect(editor).toContainText('gamma beta alpha')

      await page.getByRole('button', { name: 'All', exact: true }).click()
      await expect(editor).toContainText('gamma beta gamma')
      const findBar = page.locator('[role="search"][aria-label="Find in note"]')
      await expect(findBar).toContainText('0/0')
    })

    test('18.1.4 Esc closes the bar and clears highlights', async ({ vaultPage: page }) => {
      const editor = page.locator('.tiptap').first()
      await editor.click()
      await page.keyboard.type('needle in a haystack of needles')
      await page.keyboard.press('Control+f')

      await page.getByRole('textbox', { name: 'Find', exact: true }).fill('needle')
      await expect(editor.locator('.find-match')).toHaveCount(2)

      await page.keyboard.press('Escape')
      await expect(page.locator('[role="search"][aria-label="Find in note"]')).toBeHidden()
      await expect(editor.locator('.find-match')).toHaveCount(0)
    })

    test('18.1.5 Mode bar Search button opens the bar', async ({ vaultPage: page }) => {
      await page.getByRole('button', { name: 'Find in note' }).click()
      await expect(page.locator('[role="search"][aria-label="Find in note"]')).toBeVisible()
    })
  })

  // ── 18.2 Headings outline ───────────────────────────────────────────

  test.describe('18.2 Outline panel', () => {
    test('18.2.1 Headings appear live and click scrolls', async ({ vaultPage: page }) => {
      const editor = page.locator('.tiptap').first()
      await editor.click()
      await page.keyboard.type('# First Section')
      await page.keyboard.press('Enter')
      // Pad the note so the last heading is off-screen.
      for (let i = 0; i < 30; i++) {
        await page.keyboard.type(`filler paragraph ${i}`)
        await page.keyboard.press('Enter')
      }
      await page.keyboard.type('## Deep Section')

      const outline = page.locator('section[aria-label="Outline"]')
      await expect(outline).toBeVisible()
      await expect(outline).toContainText('2') // count badge

      // Expand (collapsed by default) and check both headings are listed.
      await outline.getByRole('button', { name: /outline/i }).click()
      await expect(outline.getByRole('button', { name: 'First Section' })).toBeVisible()
      await expect(outline.getByRole('button', { name: 'Deep Section' })).toBeVisible()

      // Click-to-scroll: scroll to top first, then jump to the deep heading.
      const scroller = page.getByTestId('note-scroll-container')
      await scroller.evaluate((el) => {
        el.scrollTop = 0
      })
      await outline.getByRole('button', { name: 'Deep Section' }).click()
      await expect
        .poll(async () => scroller.evaluate((el) => el.scrollTop), { timeout: 5_000 })
        .toBeGreaterThan(0)
    })
  })

  // ── 18.3 Source mode + scroll preservation ──────────────────────────

  test.describe('18.3 Source mode', () => {
    test('18.3.1 Source mode is a CodeMirror editor and round-trips content', async ({
      vaultPage: page,
    }) => {
      const editor = page.locator('.tiptap').first()
      await editor.click()
      await page.keyboard.type('# Round Trip')
      await page.keyboard.press('Enter')
      await page.keyboard.type('body text here')

      await page.getByRole('tab', { name: 'Source (raw markdown)' }).click()
      const source = page.locator('[aria-label="Raw markdown source"]')
      await expect(source).toBeVisible()
      await expect(source.locator('.cm-content')).toContainText('# Round Trip')
      await expect(source.locator('.cm-content')).toContainText('body text here')

      await page.getByRole('tab', { name: 'Visual editor' }).click()
      await expect(editor.locator('h1')).toContainText('Round Trip')
    })

    test('18.3.2 Scroll position survives the mode toggle both ways', async ({
      vaultPage: page,
    }) => {
      const editor = page.locator('.tiptap').first()
      await editor.click()
      for (let i = 0; i < 60; i++) {
        await page.keyboard.type(`line number ${i}`)
        await page.keyboard.press('Enter')
      }

      // Scroll the visual editor near the bottom.
      const scroller = page.getByTestId('note-scroll-container')
      await scroller.evaluate((el) => {
        el.scrollTop = el.scrollHeight
      })
      const visualScroll = await scroller.evaluate((el) => el.scrollTop)
      expect(visualScroll).toBeGreaterThan(0)

      // → Source: lands proportionally deep, not at the top. CodeMirror's
      // .cm-scroller is the scrolling element (the host div fills height).
      await page.getByRole('tab', { name: 'Source (raw markdown)' }).click()
      const source = page.locator('[aria-label="Raw markdown source"]')
      await expect(source).toBeVisible()
      const cmScroller = source.locator('.cm-scroller')
      await expect
        .poll(async () => cmScroller.evaluate((el) => el.scrollTop), { timeout: 5_000 })
        .toBeGreaterThan(0)

      // → Visual: restored again.
      await page.getByRole('tab', { name: 'Visual editor' }).click()
      await expect
        .poll(async () => scroller.evaluate((el) => el.scrollTop), { timeout: 5_000 })
        .toBeGreaterThan(0)
    })
  })

  // ── 18.4 Table controls ─────────────────────────────────────────────

  test.describe('18.4 Table controls', () => {
    test('18.4.1 Bubble menu appears in a table and adds a row', async ({ vaultPage: page }) => {
      const editor = page.locator('.tiptap').first()
      await editor.click()
      await page.keyboard.type('/table')
      const menu = page.locator('[role="listbox"][aria-label="Slash commands"]')
      await expect(menu).toBeVisible()
      await menu.locator('button', { hasText: 'Table' }).click()

      await expect(editor.locator('table')).toBeVisible()
      const toolbar = page.locator('[role="toolbar"][aria-label="Table"]')
      await expect(toolbar).toBeVisible()

      const rowsBefore = await editor.locator('table tr').count()
      await toolbar.getByRole('button', { name: 'Add row below' }).click()
      await expect(editor.locator('table tr')).toHaveCount(rowsBefore + 1)
    })
  })

  // ── 18.5 Word count ─────────────────────────────────────────────────

  test.describe('18.5 Word count', () => {
    test('18.5.1 Mode bar shows a live word count', async ({ vaultPage: page }) => {
      const editor = page.locator('.tiptap').first()
      await editor.click()
      await page.keyboard.type('one two three')
      await expect(page.getByText(/3 words/)).toBeVisible()
    })
  })
})
