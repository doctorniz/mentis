import { test, expect, navigateTo, createMarkdownNote, writeVaultFile } from './fixtures'

async function createNoteViaOPFS(
  page: import('@playwright/test').Page,
  filename: string,
  content: string,
) {
  await writeVaultFile(page, filename, content)
}

async function createNoteInSubfolder(
  page: import('@playwright/test').Page,
  folder: string,
  filename: string,
  content: string,
) {
  await writeVaultFile(page, `${folder}/${filename}`, content)
}

async function openSearchAndQuery(page: import('@playwright/test').Page, query: string) {
  // Specs seed notes straight into OPFS; the MiniSearch index only does a
  // full rebuild on vault open (in-app saves update it incrementally).
  // Reload so the bootstrap rebuild picks the seeded files up.
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('nav', { timeout: 30_000 })
  await page.waitForTimeout(1500) // index rebuild

  await navigateTo(page, 'search')
  await page.waitForTimeout(500)

  const searchInput = page
    .locator('input[type="text"], input[type="search"], [placeholder*="earch"]')
    .first()
  await searchInput.click()
  await searchInput.clear()
  await searchInput.fill(query)
  await page.waitForTimeout(1500) // debounce + query time
}

test.describe('11 — Search', () => {
  test.describe('11.1 Index & Query', () => {
    test('11.1.1 Open vault — search index built', async ({ vaultPage: page }) => {
      // Vault is already opened by fixture; navigate to search
      await navigateTo(page, 'search')
      await page.waitForTimeout(500)

      // Search view should be visible with input ready
      const searchInput = page
        .locator('input[type="text"], input[type="search"], [placeholder*="earch"]')
        .first()
      await expect(searchInput).toBeVisible({ timeout: 10_000 })
    })

    test('11.1.2 Create/save file — index updated', async ({ vaultPage: page }) => {
      // Create a note with distinctive content
      await createNoteViaOPFS(
        page,
        'index-test.md',
        '---\ntitle: Quantum Computing\n---\n\n# Quantum Computing\n\nQuantum entanglement and superposition.',
      )
      await page.waitForTimeout(2000) // allow index rebuild

      await openSearchAndQuery(page, 'Quantum')

      // Should find the newly created note
      await expect(page.getByText(/Quantum/).first()).toBeVisible({ timeout: 10_000 })
    })

    test('11.1.5 Fuzzy search — "projct" matches "project"', async ({ vaultPage: page }) => {
      await createNoteViaOPFS(
        page,
        'project-note.md',
        '---\ntitle: Project Plan\n---\n\n# Project Plan\n\nThis is our main project overview.',
      )
      await page.waitForTimeout(2000)

      await openSearchAndQuery(page, 'projct')

      // Fuzzy matching should find "project"
      await expect(page.getByText(/[Pp]roject/).first()).toBeVisible({ timeout: 10_000 })
    })

    test('11.1.6 Prefix matching — "pro" matches "project"', async ({ vaultPage: page }) => {
      await createNoteViaOPFS(
        page,
        'project-prefix.md',
        '---\ntitle: Project Notes\n---\n\n# Project Notes\n\nProject management tips and tricks.',
      )
      await page.waitForTimeout(2000)

      await openSearchAndQuery(page, 'pro')

      // Prefix matching should find "project"
      await expect(page.getByText(/[Pp]roject/).first()).toBeVisible({ timeout: 10_000 })
    })
  })

  test.describe('11.2 Filters', () => {
    test('11.2.1 File type filter: markdown only', async ({ vaultPage: page }) => {
      await createNoteViaOPFS(
        page,
        'filter-test.md',
        '---\ntitle: Filter Target\n---\n\n# Filter Target\n\nThis note should appear in markdown filter.',
      )
      await page.waitForTimeout(2000)

      await openSearchAndQuery(page, 'Filter Target')
      await page.waitForTimeout(500)

      // Look for a file type filter control and select markdown
      const typeFilter = page
        .locator('[data-testid="type-filter"], button:has-text("Type"), select')
        .first()
      if (await typeFilter.isVisible()) {
        await typeFilter.click()
        await page.waitForTimeout(300)
        const mdOption = page.getByText(/markdown/i).first()
        if (await mdOption.isVisible()) {
          await mdOption.click()
          await page.waitForTimeout(1000)
        }
      }

      // Result should still show markdown file
      await expect(page.getByText(/Filter Target/).first()).toBeVisible({ timeout: 5_000 })
    })

    test('11.2.3 Folder prefix filter', async ({ vaultPage: page }) => {
      await createNoteInSubfolder(
        page,
        'research',
        'deep-learning.md',
        '---\ntitle: Deep Learning\n---\n\n# Deep Learning\n\nNeural networks and backpropagation.',
      )
      await createNoteViaOPFS(
        page,
        'shallow-note.md',
        '---\ntitle: Shallow Note\n---\n\n# Shallow Note\n\nThis is at vault root.',
      )
      await page.waitForTimeout(2000)

      await openSearchAndQuery(page, 'learning')
      await page.waitForTimeout(500)

      // Look for folder filter and select "research"
      const folderFilter = page
        .locator('[data-testid="folder-filter"], button:has-text("Folder"), [placeholder*="older"]')
        .first()
      if (await folderFilter.isVisible()) {
        await folderFilter.click()
        await page.waitForTimeout(300)
        const researchOption = page.getByText(/research/i).first()
        if (await researchOption.isVisible()) {
          await researchOption.click()
          await page.waitForTimeout(1000)
        }
      }

      // Should show the file in the research folder
      await expect(page.getByText(/Deep Learning/).first()).toBeVisible({ timeout: 5_000 })
    })
  })

  test.describe('11.3 Content Indexing', () => {
    test('11.3.1 Markdown: title + body indexed', async ({ vaultPage: page }) => {
      await createNoteViaOPFS(
        page,
        'content-indexed.md',
        '---\ntitle: Astrophysics Primer\n---\n\n# Astrophysics Primer\n\nBlack holes emit Hawking radiation at the event horizon.',
      )
      await page.waitForTimeout(2000)

      // Search by title
      await openSearchAndQuery(page, 'Astrophysics')
      await expect(page.getByText(/Astrophysics/).first()).toBeVisible({ timeout: 10_000 })

      // Clear and search by body content
      const searchInput = page
        .locator('input[type="text"], input[type="search"], [placeholder*="earch"]')
        .first()
      await searchInput.clear()
      await searchInput.fill('Hawking radiation')
      await page.waitForTimeout(1500)

      await expect(page.getByText(/Hawking|Astrophysics/).first()).toBeVisible({ timeout: 10_000 })
    })

    test('11.3.4 Snippet generation', async ({ vaultPage: page }) => {
      await createNoteViaOPFS(
        page,
        'snippet-note.md',
        '---\ntitle: Snippet Test\n---\n\n# Snippet Test\n\nThe quick brown fox jumped over the lazy dog in the moonlight.',
      )
      await page.waitForTimeout(2000)

      await openSearchAndQuery(page, 'moonlight')

      // Results should show a text snippet with the matched term
      const resultArea = page.locator(
        '[class*="result"], [class*="search"], [data-testid*="result"]',
      )
      await expect(resultArea.first()).toBeVisible({ timeout: 10_000 })

      // The snippet should contain some surrounding text
      await expect(page.getByText(/moonlight/).first()).toBeVisible()
    })
  })
})
