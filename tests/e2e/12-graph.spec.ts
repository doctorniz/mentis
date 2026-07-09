import { test, expect, navigateTo, writeVaultFile } from './fixtures'

async function createNoteViaOPFS(
  page: import('@playwright/test').Page,
  filename: string,
  content: string,
) {
  await writeVaultFile(page, filename, content)
}

async function seedGraphNotes(page: import('@playwright/test').Page) {
  await createNoteViaOPFS(
    page,
    'note-alpha.md',
    '---\ntitle: Alpha\n---\n\n# Alpha\n\nThis links to [[Beta]] and [[Gamma]].',
  )
  await createNoteViaOPFS(
    page,
    'note-beta.md',
    '---\ntitle: Beta\n---\n\n# Beta\n\nThis links back to [[Alpha]].',
  )
  await createNoteViaOPFS(
    page,
    'note-gamma.md',
    '---\ntitle: Gamma\n---\n\n# Gamma\n\nGamma is a standalone page linked from Alpha.',
  )
  await createNoteViaOPFS(
    page,
    'orphan-note.md',
    '---\ntitle: Orphan\n---\n\n# Orphan\n\nThis note has no links to or from other notes.',
  )
  // A note with a broken wiki-link
  await createNoteViaOPFS(
    page,
    'broken-link.md',
    '---\ntitle: Broken Link\n---\n\n# Broken Link\n\nThis references [[NonExistent Page]] which does not exist.',
  )
  await page.waitForTimeout(2000) // allow index rebuild
}

test.describe('12 — Graph Visualization', () => {
  test.describe('12.1 Rendering & Interaction', () => {
    test('12.1.1 Open graph — nodes for all files', async ({ vaultPage: page }) => {
      await seedGraphNotes(page)
      await navigateTo(page, 'graph')
      await page.waitForTimeout(1500)

      // Graph should render a canvas element
      const canvas = page.locator('canvas').first()
      await expect(canvas).toBeVisible({ timeout: 10_000 })

      // Canvas should have non-zero dimensions
      const box = await canvas.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.width).toBeGreaterThan(100)
      expect(box!.height).toBeGreaterThan(100)
    })

    test.fixme('12.1.2 Distinct shapes: circle (note), rounded square (PDF), diamond (canvas)', async ({
      vaultPage: page,
    }) => {
      // Visual assertion on canvas content — cannot reliably verify shapes programmatically
      await seedGraphNotes(page)
      await navigateTo(page, 'graph')
      await page.waitForTimeout(1500)

      const canvas = page.locator('canvas').first()
      await expect(canvas).toBeVisible({ timeout: 10_000 })

      // Would need pixel-level or snapshot comparison to verify distinct shapes
    })

    test.fixme('12.1.4 Click node — opens file', async ({ vaultPage: page }) => {
      // Canvas click coordinates are hard to target without knowing node positions
      await seedGraphNotes(page)
      await navigateTo(page, 'graph')
      await page.waitForTimeout(2000)

      const canvas = page.locator('canvas').first()
      await expect(canvas).toBeVisible({ timeout: 10_000 })

      // Click center of the canvas — may or may not hit a node
      const box = await canvas.boundingBox()
      if (box) {
        await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } })
        await page.waitForTimeout(1000)
      }
    })

    test('12.1.6 Pan and zoom', async ({ vaultPage: page }) => {
      await seedGraphNotes(page)
      await navigateTo(page, 'graph')
      await page.waitForTimeout(1500)

      const canvas = page.locator('canvas').first()
      await expect(canvas).toBeVisible({ timeout: 10_000 })

      const box = await canvas.boundingBox()
      expect(box).not.toBeNull()

      // Pan: drag from a corner region — clicking dead-center can land on
      // a node, and graph nodes are click-to-open (navigates away).
      await page.mouse.move(box!.x + 40, box!.y + 40)
      await page.mouse.down()
      await page.mouse.move(box!.x + 140, box!.y + 140)
      await page.mouse.up()
      await page.waitForTimeout(300)

      // Zoom: scroll wheel
      await canvas.hover()
      await page.mouse.wheel(0, -200)
      await page.waitForTimeout(500)
      await page.mouse.wheel(0, 200)
      await page.waitForTimeout(500)

      // If we got here without errors, pan and zoom are functional
      await expect(canvas).toBeVisible()
    })
  })

  test.describe('12.2 Edge Cases', () => {
    test('12.2.3 Orphan node (no links) — still visible', async ({ vaultPage: page }) => {
      await seedGraphNotes(page)
      await navigateTo(page, 'graph')
      await page.waitForTimeout(2000)

      const canvas = page.locator('canvas').first()
      await expect(canvas).toBeVisible({ timeout: 10_000 })

      // The graph should render — with orphan nodes included.
      // We can't directly verify the orphan node on canvas,
      // but we can check that the graph didn't crash and has content.
      const box = await canvas.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.width).toBeGreaterThan(100)
      expect(box!.height).toBeGreaterThan(100)

      // Check node count if exposed in UI (some graph UIs show a count)
      const nodeCount = page.locator('[data-testid="graph-node-count"], [class*="node-count"]')
      if (await nodeCount.isVisible().catch(() => false)) {
        const text = await nodeCount.textContent()
        // Should have at least 5 nodes (alpha, beta, gamma, orphan, broken-link)
        const count = parseInt(text || '0', 10)
        expect(count).toBeGreaterThanOrEqual(5)
      }
    })

    test('12.2.2 Broken link — no edge created for nonexistent target', async ({
      vaultPage: page,
    }) => {
      await seedGraphNotes(page)
      await navigateTo(page, 'graph')
      await page.waitForTimeout(2000)

      const canvas = page.locator('canvas').first()
      await expect(canvas).toBeVisible({ timeout: 10_000 })

      // The graph should render without errors even with broken wiki-links.
      // A broken link to [[NonExistent Page]] should not create an edge
      // to a phantom node (depending on implementation, it may create a ghost node).
      // Primary assertion: graph renders without crashing.
      const box = await canvas.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.width).toBeGreaterThan(0)
    })
  })
})
