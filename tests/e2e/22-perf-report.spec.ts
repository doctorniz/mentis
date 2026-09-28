import fs from 'node:fs'
import path from 'node:path'
import { test, navigateTo, writeVaultFile } from './fixtures'

/**
 * Timing budgets from perf-budgets.json — REPORT ONLY.
 *
 * These are web-build proxies for budgets that belong to the Tauri app, and CI
 * runners share the machine with three other Playwright workers, so the numbers
 * are noisy. The spec prints them next to their budgets and never fails on
 * them. Timings are taken inside the page (performance.now) so Playwright's
 * round-trips aren't counted.
 */

const budgets = JSON.parse(
  // Playwright runs from the repo root.
  fs.readFileSync(path.resolve(process.cwd(), 'perf-budgets.json'), 'utf8'),
).timing as { desktopColdStartMs: number; openNoteMs: number; firstSearchMs: number }

// vault-left-search.tsx waits this long after typing before querying.
const SEARCH_DEBOUNCE_MS = 200

/** Resolve with ms from click until the editor shows `text`. */
async function timeOpenNote(page: import('@playwright/test').Page, stem: string, text: string) {
  return page.evaluate(
    async ({ stem, text }) => {
      const tree = document.querySelector('[role="tree"][aria-label="Vault file tree"]')
      const button = [...(tree?.querySelectorAll('button') ?? [])].find(
        (b) => b.textContent?.trim() === stem,
      )
      if (!button) throw new Error(`No tree entry for ${stem}`)
      const t0 = performance.now()
      button.click()
      await new Promise<void>((resolve) => {
        const check = () =>
          [...document.querySelectorAll('.tiptap')].some((e) => e.textContent?.includes(text))
            ? resolve()
            : requestAnimationFrame(check)
        check()
      })
      return performance.now() - t0
    },
    { stem, text },
  )
}

test('22 — Timing budgets (report only)', async ({ vaultPage: page }, testInfo) => {
  await writeVaultFile(page, 'perf-a.md', '# Perf A\n\nFirst body with zephyrine.\n')
  await writeVaultFile(page, 'perf-b.md', '# Perf B\n\nSecond body.\n')

  // Cold start: reload with the vault already chosen, until the shell's nav is
  // in the DOM (ms since navigation start). The reload also rebuilds the search
  // index with the notes above.
  await page.addInitScript(() => {
    new MutationObserver((_, observer) => {
      if (document.querySelector('nav[aria-label="Main views"]')) {
        ;(window as unknown as { __shellAt: number }).__shellAt = performance.now()
        observer.disconnect()
      }
    }).observe(document, { childList: true, subtree: true })
  })
  await page.reload()
  const coldStart = await page.waitForFunction(
    () => (window as unknown as { __shellAt?: number }).__shellAt,
    undefined,
    { timeout: 30_000 },
  )
  const coldStartMs = (await coldStart.jsonValue()) as number

  // Let the idle preloads and the index rebuild finish, as a user would.
  await page.waitForTimeout(3000)

  await navigateTo(page, 'vault')
  const firstNoteMs = await timeOpenNote(page, 'perf-a', 'First body')
  const secondNoteMs = await timeOpenNote(page, 'perf-b', 'Second body')

  await page.locator('button[aria-label="Search vault"]').first().click()
  const searchMs = await page.evaluate(async () => {
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Search vault"]')
    const results = input?.parentElement?.nextElementSibling
    if (!input || !results) throw new Error('Search panel not found')
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    const t0 = performance.now()
    setValue.call(input, 'zephyrine')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise<void>((resolve) => {
      const check = () =>
        results.querySelector('button') ? resolve() : requestAnimationFrame(check)
      check()
    })
    return performance.now() - t0
  })

  const rows: Array<[string, number, number]> = [
    ['Cold start (vault restored)', coldStartMs, budgets.desktopColdStartMs],
    ['Open a note (first)', firstNoteMs, budgets.openNoteMs],
    ['Open a note (second)', secondNoteMs, budgets.openNoteMs],
    ['First search results (raw)', searchMs, budgets.firstSearchMs],
    [
      `First search results (−${SEARCH_DEBOUNCE_MS} ms debounce)`,
      searchMs - SEARCH_DEBOUNCE_MS,
      budgets.firstSearchMs,
    ],
  ]

  const server = process.env.CI ? 'built site' : 'dev server — not representative'
  const lines = rows.map(
    ([label, ms, budget]) =>
      `  ${label.padEnd(40)} ${ms.toFixed(0).padStart(6)} ms / ${String(budget).padStart(5)} ms  ${ms <= budget ? 'ok' : 'over'}`,
  )
  console.log(`\nTiming budgets, report only (${server})\n${lines.join('\n')}\n`)
  for (const [label, ms, budget] of rows) {
    testInfo.annotations.push({
      type: 'perf',
      description: `${label}: ${ms.toFixed(0)} ms (budget ${budget} ms)`,
    })
  }
})
