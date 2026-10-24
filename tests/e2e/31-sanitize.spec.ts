import { test, expect, navigateTo } from './fixtures'
import type { Page } from '@playwright/test'

/**
 * Markdown from outside the app (a Thought shared in from another app, a
 * model answer that quotes a vault file) is rendered as HTML. It must not
 * run script or restyle the app. Runs in a real browser: DOMPurify does
 * not sanitise under happy-dom.
 */

const PAYLOADS = [
  '<details open ontoggle="window.__xss=1">a</details>',
  '<details open/ontoggle="window.__xss=2">b</details>',
  '<a href=javascript:window.__xss=3>c</a>',
  '<img src=x onerror="window.__xss=4">',
  '<svg><animate onbegin="window.__xss=5" attributeName=x dur=1s></svg>',
  '<math><mtext><table><mglyph><style><img src=x onerror="window.__xss=6">',
  '<p style="position:fixed;inset:0;background:red">cover</p>',
  '<style>body{display:none}</style>',
  '<form action="https://evil.example"><input name=pw></form>',
]

const MARKER = 'sanitise-check'
// Ordinary markdown first: the unclosed <math> payload swallows what follows it.
const BODY = `${MARKER} **bold** [site](https://example.com)\n\n${PAYLOADS.join('\n\n')}`

async function writeVaultFile(page: Page, path: string, text: string) {
  await page.evaluate(
    async ({ path, text }) => {
      const vaults = await (await navigator.storage.getDirectory()).getDirectoryHandle('vaults')
      let dir: FileSystemDirectoryHandle | undefined
      for await (const [, h] of (vaults as any).entries()) {
        if (h.kind === 'directory') dir = h as FileSystemDirectoryHandle
      }
      const parts = path.split('/')
      for (const p of parts.slice(0, -1)) dir = await dir!.getDirectoryHandle(p, { create: true })
      const w = await (await dir!.getFileHandle(parts.at(-1)!, { create: true })).createWritable()
      await w.write(text)
      await w.close()
    },
    { path, text },
  )
}

/** Script that ran, or markup inside `root` that could run script or restyle the app. */
async function dangers(page: Page, root: string): Promise<string[]> {
  await page.waitForTimeout(500)
  return page.evaluate((root) => {
    const found: string[] = []
    const xss = (window as unknown as { __xss?: number }).__xss
    if (xss !== undefined) found.push(`ran payload ${xss}`)
    if (getComputedStyle(document.body).display === 'none') found.push('body hidden')
    for (const scope of document.querySelectorAll(root)) {
      for (const el of scope.querySelectorAll('*')) {
        const tag = el.tagName.toLowerCase()
        if (['script', 'style', 'svg', 'math', 'form', 'iframe'].includes(tag))
          found.push(`<${tag}>`)
        for (const a of el.attributes) {
          const v = a.value.replace(/\s/g, '').toLowerCase()
          if (a.name.startsWith('on') || a.name === 'style') found.push(`${tag}[${a.name}]`)
          if (v.startsWith('javascript:')) found.push(`${tag}[${a.name}=${v}]`)
        }
      }
    }
    return found
  }, root)
}

async function seedVaultChat(page: Page, id: string, title: string, answer: string) {
  const now = new Date().toISOString()
  const thread = {
    schemaVersion: 1,
    id,
    documentAssetId: '_vault',
    documentPath: '',
    title,
    createdAt: now,
    modifiedAt: now,
    messages: [
      { id: 'u1', role: 'user', content: 'Summarise my notes', createdAt: now },
      { id: 'a1', role: 'assistant', content: answer, createdAt: now },
    ],
  }
  await writeVaultFile(page, `_mentis/_chats/_vault/${id}.json`, JSON.stringify(thread))
}

test.describe('31 — Sanitised HTML', () => {
  test('31.1 a Thought with hostile HTML renders inert', async ({ vaultPage: page }) => {
    const now = new Date().toISOString()
    await writeVaultFile(
      page,
      'Thoughts/zz-hostile.md',
      `---\ntype: thought\ncreated: '${now}'\nmodified: '${now}'\ncolor: yellow\n---\n${BODY}\n`,
    )
    await navigateTo(page, 'board')
    const card = page.locator('.board-card-prose', { hasText: MARKER })
    await expect(card).toBeVisible({ timeout: 10_000 })
    await expect(card.locator('strong')).toHaveText('bold')

    expect(await dangers(page, '.board-card-prose')).toEqual([])
  })

  test('31.2 a chat answer with hostile HTML renders inert', async ({ vaultPage: page }) => {
    await seedVaultChat(page, '00000000-0000-4000-8000-000000000031', 'Hostile answer', BODY)
    await navigateTo(page, 'chat')
    await page.getByText('Hostile answer').first().click()
    const answer = page.locator('.chat-assistant-prose', { hasText: MARKER })
    await expect(answer).toBeVisible({ timeout: 10_000 })
    await expect(answer.locator('a[href="https://example.com"]')).toHaveAttribute(
      'target',
      '_blank',
    )

    expect(await dangers(page, '.chat-assistant-prose')).toEqual([])
  })

  test('31.3 a chat answer keeps its formatting and in-app vault links', async ({
    vaultPage: page,
  }) => {
    const answer = [
      '## Plan',
      '| a | b |\n| - | - |\n| 1 | 2 |',
      '```ts\nconst x = 1\n```',
      'See [the plan](Notes/plan.md) and `Notes/plan.md`.',
    ].join('\n\n')
    await seedVaultChat(page, '00000000-0000-4000-8000-000000000032', 'Formatted answer', answer)
    await navigateTo(page, 'chat')
    await page.getByText('Formatted answer').first().click()
    const prose = page.locator('.chat-assistant-prose', { hasText: 'See' })
    await expect(prose.locator('h2')).toHaveText('Plan')
    await expect(prose.locator('table td').first()).toHaveText('1')
    await expect(prose.locator('code.language-ts')).toBeVisible()
    const vaultLink = prose.locator('a.chat-vault-source', { hasText: 'the plan' })
    await expect(vaultLink).toHaveAttribute('data-ink-path', 'Notes/plan.md')
    await expect(vaultLink).not.toHaveAttribute('target', /.*/)
  })
})
