import { test, expect, writeVaultFile } from './fixtures'

/**
 * The file tree on opening a vault that has files in it. Reading a folder can
 * take a while (a phone's picked folder is slow), and until it has been read
 * the tree must not claim the vault is empty.
 */

test.describe('34 — File tree', () => {
  test('34.1 A vault that has files never reads "No files yet." while it opens', async ({
    vaultPage: page,
  }) => {
    for (const name of ['Alpha', 'Beta', 'Gamma']) {
      await writeVaultFile(page, `${name}/Note.md`, `# ${name}\n`)
    }
    // Reopened once, so the saved index knows the folders.
    await page.addInitScript(() => {
      const w = window as unknown as { __reconciled?: number }
      window.addEventListener('ink:search-index-reconciled', () => (w.__reconciled = 1))
    })
    await page.reload()
    await page.waitForFunction(() => (window as unknown as { __reconciled?: number }).__reconciled)

    // Then every folder read takes a second and a half.
    await page.addInitScript(() => {
      const proto = FileSystemDirectoryHandle.prototype as unknown as {
        entries: () => AsyncIterableIterator<unknown>
      }
      const entries = proto.entries
      proto.entries = async function* (this: unknown) {
        await new Promise((r) => setTimeout(r, 1500))
        yield* entries.call(this)
      }
    })
    await page.reload()

    const empty = page.getByText('No files yet.')
    const tree = page.getByRole('tree', { name: 'Vault file tree' })
    const deadline = Date.now() + 8000
    while (Date.now() < deadline) {
      expect(await empty.isVisible(), 'the tree called a vault with files empty').toBe(false)
      if (await tree.getByRole('treeitem').count()) break
      await page.waitForTimeout(25)
    }
    await expect(tree.getByRole('treeitem', { name: /Alpha/ })).toBeVisible()
  })

  test('34.2 An empty vault says so once it has been read', async ({ vaultPage: page }) => {
    // A new vault holds only the welcome note; remove it (the app's own folder stays).
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory()
      const vaults = await root.getDirectoryHandle('vaults')
      const iter = (vaults as unknown as { values(): AsyncIterable<FileSystemHandle> }).values()
      for await (const e of iter) {
        if (e.kind !== 'directory') continue
        const dir = e as FileSystemDirectoryHandle
        const names: string[] = []
        for await (const name of (dir as unknown as { keys(): AsyncIterable<string> }).keys())
          names.push(name)
        for (const n of names) if (!n.startsWith('_')) await dir.removeEntry(n, { recursive: true })
      }
    })
    await page.reload()
    await expect(page.getByText('No files yet.')).toBeVisible({ timeout: 15_000 })
  })
})
