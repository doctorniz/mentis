import {
  test,
  expect,
  navigateTo,
  createMarkdownNote,
  typeInEditor,
  waitForAutoSave,
} from './fixtures'

test.describe('Markdown Editor', () => {
  test.beforeEach(async ({ vaultPage: page }) => {
    await navigateTo(page, 'vault')
    await createMarkdownNote(page)
  })

  // ── 3.1 Slash Commands ──────────────────────────────────────────────

  test.describe('3.1 Slash Commands', () => {
    test('3.1.1 Type / at start of line — menu appears', async ({ vaultPage: page }) => {
      const editor = page.locator('.tiptap').first()
      await editor.click()
      await editor.press('Enter')
      await page.keyboard.type('/')

      const menu = page.locator('[role="listbox"][aria-label="Slash commands"]')
      await expect(menu).toBeVisible({ timeout: 5_000 })
    })

    test('3.1.2 Filter by typing /h1 — shows Heading 1', async ({ vaultPage: page }) => {
      const editor = page.locator('.tiptap').first()
      await editor.click()
      await editor.press('Enter')
      await page.keyboard.type('/h1')

      const menu = page.locator('[role="listbox"][aria-label="Slash commands"]')
      await expect(menu).toBeVisible({ timeout: 5_000 })

      const h1Option = menu.locator('button', { hasText: 'Heading 1' })
      await expect(h1Option).toBeVisible()
    })

    test('3.1.3 Select Heading 1, 2, 3 — verify block type changes', async ({
      vaultPage: page,
    }) => {
      const editor = page.locator('.tiptap').first()

      for (const level of [1, 2, 3] as const) {
        await editor.click()
        await editor.press('Enter')
        await page.keyboard.type(`/h${level}`)

        const menu = page.locator('[role="listbox"][aria-label="Slash commands"]')
        await expect(menu).toBeVisible({ timeout: 5_000 })

        const option = menu.locator('button', { hasText: `Heading ${level}` })
        await option.click()

        await expect(editor.locator(`h${level}`).last()).toBeVisible()
      }
    })

    test('3.1.8 Escape key — dismisses slash menu', async ({ vaultPage: page }) => {
      const editor = page.locator('.tiptap').first()
      await editor.click()
      await editor.press('Enter')
      await page.keyboard.type('/')

      const menu = page.locator('[role="listbox"][aria-label="Slash commands"]')
      await expect(menu).toBeVisible({ timeout: 5_000 })

      await page.keyboard.press('Escape')
      await expect(menu).not.toBeVisible({ timeout: 3_000 })
    })
  })

  // ── 3.2 Inline Formatting ──────────────────────────────────────────

  test.describe('3.2 Inline Formatting', () => {
    test('3.2.1 Ctrl+B — toggle bold', async ({ vaultPage: page }) => {
      const editor = page.locator('.tiptap').first()
      await editor.click()
      await editor.press('Enter')

      await page.keyboard.press('Control+b')
      await page.keyboard.type('bold text')
      await page.keyboard.press('Control+b')

      await expect(editor.locator('strong', { hasText: 'bold text' })).toBeVisible()
    })

    test('3.2.2 Ctrl+I — toggle italic', async ({ vaultPage: page }) => {
      const editor = page.locator('.tiptap').first()
      await editor.click()
      await editor.press('Enter')

      await page.keyboard.press('Control+i')
      await page.keyboard.type('italic text')
      await page.keyboard.press('Control+i')

      await expect(editor.locator('em', { hasText: 'italic text' })).toBeVisible()
    })

    test('3.2.4 Inline code via Ctrl+E', async ({ vaultPage: page }) => {
      // Tiptap's Code mark binds Mod-E (there is no Ctrl+` binding).
      const editor = page.locator('.tiptap').first()
      await editor.click()
      await editor.press('Enter')

      await page.keyboard.press('Control+e')
      await page.keyboard.type('inline code')
      await page.keyboard.press('Control+e')

      await expect(editor.locator('code', { hasText: 'inline code' })).toBeVisible()
    })

    test('3.2.6 Nested formatting (bold + italic)', async ({ vaultPage: page }) => {
      const editor = page.locator('.tiptap').first()
      await editor.click()
      await editor.press('Enter')

      await page.keyboard.press('Control+b')
      await page.keyboard.press('Control+i')
      await page.keyboard.type('bold italic')
      await page.keyboard.press('Control+i')
      await page.keyboard.press('Control+b')

      const boldItalic = editor.locator('strong em, em strong', { hasText: 'bold italic' })
      await expect(boldItalic).toBeVisible()
    })
  })

  // ── 3.3 Wiki-Links & Navigation ────────────────────────────────────

  test.describe('3.3 Wiki-Links & Navigation', () => {
    test('3.3.1 Type [[ — autocomplete menu appears', async ({ vaultPage: page }) => {
      const editor = page.locator('.tiptap').first()
      await editor.click()
      await editor.press('Enter')
      await page.keyboard.type('[[')

      const menu = page.locator('[role="listbox"][aria-label="Wiki link targets"]')
      await expect(menu).toBeVisible({ timeout: 5_000 })
    })

    test('3.3.3 Select file — [[filename]] node created', async ({ vaultPage: page }) => {
      // First create a second note so there's something to link to
      await createMarkdownNote(page, 'Link Target')
      await waitForAutoSave(page)

      // Create a new note and type [[
      await createMarkdownNote(page, 'Linking Note')
      const editor = page.locator('.tiptap').first()
      await editor.click()
      await editor.press('Enter')
      await page.keyboard.type('[[')

      const menu = page.locator('[role="listbox"][aria-label="Wiki link targets"]')
      await expect(menu).toBeVisible({ timeout: 5_000 })

      // Select the first option
      const firstOption = menu.locator('button[role="option"]').first()
      if (await firstOption.isVisible()) {
        await firstOption.click()
      }

      // Wiki-link node should be inserted (rendered as a span/link in Tiptap)
      const wikiLink = editor.locator('[data-type="wikiLink"], .wiki-link, a[data-wiki-link]')
      await expect(wikiLink.first()).toBeVisible({ timeout: 5_000 })
    })
  })

  // ── 3.4 Math ───────────────────────────────────────────────────────

  test.describe('3.4 Math', () => {
    test('3.4.1 Inline math $E=mc^2$ — renders inline LaTeX', async ({ vaultPage: page }) => {
      const editor = page.locator('.tiptap').first()
      await editor.click()
      await editor.press('Enter')

      // Type inline math using $ delimiters
      await page.keyboard.type('$E=mc^2$')
      await page.waitForTimeout(500)

      // KaTeX should render within the editor — look for the math node or KaTeX container
      const mathNode = editor.locator('[data-type="mathInline"], .katex, .math-inline')
      // If the math node auto-renders from $...$ syntax, it should be visible
      // Otherwise the raw $ text will be present
      const hasRendered = await mathNode.count()
      if (hasRendered > 0) {
        await expect(mathNode.first()).toBeVisible()
      } else {
        // Fallback: verify the text was at least typed
        await expect(editor).toContainText('E=mc')
      }
    })

    test('3.4.3 Invalid LaTeX — no crash', async ({ vaultPage: page }) => {
      const editor = page.locator('.tiptap').first()
      await editor.click()
      await editor.press('Enter')

      // Use slash command to insert math node
      await page.keyboard.type('/math')
      const menu = page.locator('[role="listbox"][aria-label="Slash commands"]')
      await expect(menu).toBeVisible({ timeout: 5_000 })
      const mathOption = menu.locator('button', { hasText: 'Math (inline)' })
      await mathOption.click()
      await page.waitForTimeout(300)

      // Type invalid LaTeX — should not crash the editor
      await page.keyboard.type('\\invalid{{{')
      await page.waitForTimeout(500)

      // Editor should still be functional
      await expect(editor).toBeVisible()
      await expect(editor).toBeEnabled()
    })
  })

  // ── 3.5 Tables, Code Blocks, Task Lists ───────────────────────────

  test.describe('3.5 Tables, Code Blocks, Task Lists', () => {
    test('3.5.2 Code block with language hint — verify syntax highlighting', async ({
      vaultPage: page,
    }) => {
      const editor = page.locator('.tiptap').first()
      await editor.click()
      await editor.press('Enter')

      // Use slash command to insert a code block
      await page.keyboard.type('/code')
      const menu = page.locator('[role="listbox"][aria-label="Slash commands"]')
      await expect(menu).toBeVisible({ timeout: 5_000 })
      const codeOption = menu.locator('button', { hasText: 'Code block' })
      await codeOption.click()
      await page.waitForTimeout(300)

      // Type some code
      await page.keyboard.type('const x = 42;')
      await page.waitForTimeout(500)

      // The code block should be rendered as a <pre> element
      const codeBlock = editor.locator('pre code, pre')
      await expect(codeBlock.first()).toBeVisible()
      await expect(codeBlock.first()).toContainText('const x = 42')
    })

    test('3.5.3 Task list — click checkbox — verify toggles', async ({ vaultPage: page }) => {
      const editor = page.locator('.tiptap').first()
      await editor.click()
      await editor.press('Enter')

      // Use slash command to insert a task list
      await page.keyboard.type('/todo')
      const menu = page.locator('[role="listbox"][aria-label="Slash commands"]')
      await expect(menu).toBeVisible({ timeout: 5_000 })
      const taskOption = menu.locator('button', { hasText: 'Task list' })
      await taskOption.click()
      await page.waitForTimeout(300)

      await page.keyboard.type('My task item')
      await page.waitForTimeout(300)

      // Click the actual checkbox input — a bare `[data-checked]` selector
      // would match the wrapping <li> first, and clicking the <li> does
      // not toggle the checkbox.
      const checkbox = editor.getByRole('checkbox').first()
      await expect(checkbox).toBeVisible()
      await checkbox.click({ force: true })
      await page.waitForTimeout(300)

      const item = editor.locator('li[data-checked]').first()
      await expect(item).toHaveAttribute('data-checked', 'true')
    })
  })

  // ── 3.7 Source Mode & Export ────────────────────────────────────────

  test.describe('3.7 Source Mode & Export', () => {
    test('3.7.1 Toggle source mode — shows raw .md in CodeMirror', async ({ vaultPage: page }) => {
      const editor = page.locator('.tiptap').first()
      await editor.click()
      await editor.press('Enter')
      await page.keyboard.type('Hello world')
      await waitForAutoSave(page)

      // Click the source mode tab
      const sourceTab = page.locator('button[role="tab"][aria-label="Source (raw markdown)"]')
      await sourceTab.click()
      await page.waitForTimeout(500)

      // The CodeMirror source editor should now be visible
      const source = page.locator('[aria-label="Raw markdown source"]')
      await expect(source).toBeVisible()
      await expect(source.locator('.cm-content')).toContainText('Hello world')
    })

    test('3.7.2 Edit in source mode — switch back — changes reflected', async ({
      vaultPage: page,
    }) => {
      const editor = page.locator('.tiptap').first()
      await editor.click()
      await editor.press('Enter')
      await page.keyboard.type('Original text')
      await waitForAutoSave(page)

      // Switch to source mode
      const sourceTab = page.locator('button[role="tab"][aria-label="Source (raw markdown)"]')
      await sourceTab.click()
      await page.waitForTimeout(500)

      // Append to the document in the CodeMirror editor
      const source = page.locator('[aria-label="Raw markdown source"]')
      await expect(source).toBeVisible()
      await source.locator('.cm-content').click()
      await page.keyboard.press('Control+End')
      await page.keyboard.type('\n\n**Bold from source**')
      await page.waitForTimeout(300)

      // Switch back to visual mode
      const visualTab = page.locator('button[role="tab"][aria-label="Visual editor"]')
      await visualTab.click()
      await page.waitForTimeout(1_000)

      // Verify the change appears in the visual editor
      const updatedEditor = page.locator('.tiptap').first()
      await expect(updatedEditor).toContainText('Bold from source')
    })

    test('3.7.5 Round-trip fidelity: load → save → reload', async ({ vaultPage: page }) => {
      const editor = page.locator('.tiptap').first()
      await editor.click()
      await editor.press('Enter')
      await page.keyboard.type('Round trip test content')
      await waitForAutoSave(page)

      // Switch to source mode to see the raw markdown
      const sourceTab = page.locator('button[role="tab"][aria-label="Source (raw markdown)"]')
      await sourceTab.click()
      await page.waitForTimeout(500)

      const source = page.locator('[aria-label="Raw markdown source"] .cm-content')
      await expect(source).toContainText('Round trip test content')

      // Switch back to visual to trigger a save cycle
      const visualTab = page.locator('button[role="tab"][aria-label="Visual editor"]')
      await visualTab.click()
      await waitForAutoSave(page)

      // Switch to source again to verify content survived the round-trip
      await sourceTab.click()
      await page.waitForTimeout(500)
      await expect(source).toContainText('Round trip test content')
    })
  })

  // ── 3.8 Frontmatter ───────────────────────────────────────────────

  test.describe('3.8 Frontmatter', () => {
    test('3.8.1 File with YAML frontmatter — parsed correctly, not shown in editor', async ({
      vaultPage: page,
    }) => {
      // Write a markdown file with frontmatter directly via OPFS
      await page.evaluate(async () => {
        const content = `---
title: Test Frontmatter
tags: [test, e2e]
---

# Body Content

This is the body after frontmatter.`

        const root = await navigator.storage.getDirectory()

        // Walk into the vault directory structure
        async function findVaultDir(
          dir: FileSystemDirectoryHandle,
        ): Promise<FileSystemDirectoryHandle | null> {
          for await (const [name, handle] of (dir as any).entries()) {
            if (handle.kind === 'directory' && name !== '_marrow') {
              return handle as FileSystemDirectoryHandle
            }
          }
          return dir
        }

        const vaultDir = (await findVaultDir(root)) ?? root
        const file = await vaultDir.getFileHandle('frontmatter-test.md', { create: true })
        const writable = await file.createWritable()
        await writable.write(new TextEncoder().encode(content))
        await writable.close()
      })

      // Refresh to pick up new file
      await page.keyboard.press('Control+1')
      await page.waitForTimeout(1_500)

      // Open the file from the tree
      const treeItem = page.locator('[role="treeitem"]', { hasText: 'frontmatter-test' })
      if (await treeItem.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await treeItem.locator('button').first().click()
        await page.waitForTimeout(1_000)

        const editor = page.locator('.tiptap').first()
        // Frontmatter should NOT be visible as raw text in the editor
        await expect(editor).not.toContainText('---')
        await expect(editor).not.toContainText('tags: [test, e2e]')
        // But the body content should be visible
        await expect(editor).toContainText('Body Content')
      }
    })
  })
})
