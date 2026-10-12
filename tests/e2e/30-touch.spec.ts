import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

/**
 * Touch: the bottom tab bar, swipes and press-and-hold, on a phone-sized
 * screen (the mobile project). Gestures are real touch events sent through
 * the DevTools protocol, so they reach the app as touch pointers.
 */

type Point = { x: number; y: number }

async function touchDrag(page: Page, from: Point, to: Point, opts: { holdMs?: number } = {}) {
  const cdp = await page.context().newCDPSession(page)
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', p?: Point) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y }] : [] })
  await send('touchStart', from)
  if (opts.holdMs) await page.waitForTimeout(opts.holdMs)
  const steps = 10
  for (let i = 1; i <= steps; i++) {
    await send('touchMove', {
      x: from.x + ((to.x - from.x) * i) / steps,
      y: from.y + ((to.y - from.y) * i) / steps,
    })
    await page.waitForTimeout(16)
  }
  await send('touchEnd')
  await cdp.detach()
}

async function box(page: Page, locator: ReturnType<Page['locator']>) {
  const b = await locator.boundingBox()
  if (!b) throw new Error('not on screen')
  return b
}

const tabBar = (page: Page) => page.getByTestId('mobile-tab-bar')
const tab = (page: Page, name: string) => tabBar(page).getByRole('button', { name, exact: true })

async function addTask(page: Page, title: string) {
  await tab(page, 'Organizer').tap()
  await page.getByRole('button', { name: 'Tasks', exact: true }).first().tap()
  const bar = page.getByPlaceholder('Add a task...')
  await bar.fill(title)
  await bar.press('Enter')
  await expect(page.getByText(title, { exact: true })).toBeVisible({ timeout: 10_000 })
  await bar.blur()
}

test.describe('30 — Touch', () => {
  test('30.1 The tab bar reaches Vault, Capture, Organizer, Search and More', async ({
    vaultPage: page,
  }) => {
    await expect(tabBar(page)).toBeVisible()

    await tab(page, 'Organizer').tap()
    await expect(page.getByRole('button', { name: 'Tasks', exact: true }).first()).toBeVisible()
    await expect(tab(page, 'Organizer')).toHaveAttribute('aria-current', 'page')

    await tab(page, 'Capture').tap()
    await expect(tab(page, 'Capture')).toHaveAttribute('aria-current', 'page')

    await tab(page, 'Search').tap()
    await expect(page.getByPlaceholder(/search/i).first()).toBeVisible({ timeout: 10_000 })
    // Search opens in the vault drawer, over the bar; close it to go on.
    await page.keyboard.press('Escape')

    await tab(page, 'More').tap()
    const menu = page.getByRole('dialog')
    await expect(menu.getByRole('button', { name: 'Settings' })).toBeVisible()
  })

  test('30.2 A sheet closes with a swipe down from its top', async ({ vaultPage: page }) => {
    await tab(page, 'More').tap()
    const menu = page.getByRole('dialog')
    await expect(menu).toBeVisible()
    const b = await box(page, menu)
    await touchDrag(
      page,
      { x: b.x + b.width / 2, y: b.y + 20 },
      { x: b.x + b.width / 2, y: b.y + 260 },
    )
    await expect(menu).toBeHidden()
  })

  test('30.3 Swipe a task right to complete it, left to delete it, and undo', async ({
    vaultPage: page,
  }) => {
    await addTask(page, 'Water the ferns')
    const row = page.getByRole('button', { name: /Water the ferns/ }).first()
    let b = await box(page, row)
    await touchDrag(
      page,
      { x: b.x + 40, y: b.y + b.height / 2 },
      { x: b.x + 260, y: b.y + b.height / 2 },
    )
    await expect(row.getByRole('button', { name: 'Mark incomplete' })).toBeVisible()

    b = await box(page, row)
    await touchDrag(
      page,
      { x: b.x + b.width - 40, y: b.y + b.height / 2 },
      { x: b.x + 20, y: b.y + b.height / 2 },
    )
    await expect(page.getByText('Water the ferns', { exact: true })).toBeHidden()
    await page.getByRole('button', { name: 'Undo' }).tap()
    await expect(page.getByText('Water the ferns', { exact: true })).toBeVisible({
      timeout: 10_000,
    })
  })

  test('30.4 Swipe between days in the journal', async ({ vaultPage: page }) => {
    await tab(page, 'More').tap()
    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
    await page.getByRole('dialog').getByRole('button', { name: today }).tap()
    const heading = page.getByRole('heading', { level: 1 }).first()
    await expect(heading).toBeVisible({ timeout: 10_000 })
    const first = await heading.textContent()

    const b = await box(page, page.getByRole('tablist').first().or(heading).first())
    const y = b.y + b.height + 120
    await touchDrag(page, { x: 320, y }, { x: 60, y })
    await expect(heading).not.toHaveText(first ?? '')
    await touchDrag(page, { x: 60, y }, { x: 320, y })
    await expect(heading).toHaveText(first ?? '')
  })

  test('30.5 Press and hold a list item, then drag it to reorder', async ({ vaultPage: page }) => {
    await tab(page, 'Organizer').tap()
    await page.getByRole('button', { name: 'Lists', exact: true }).first().tap()
    await page.getByLabel('Kind of new list').selectOption({ label: 'Checklist' })
    const name = page.getByLabel('New list name')
    await name.fill('Packing')
    await name.press('Enter')
    const add = page.getByLabel('Add an item')
    for (const t of ['Passport', 'Charger', 'Socks']) {
      await add.fill(t)
      await add.press('Enter')
    }
    await add.blur()
    const items = page.getByLabel('Item', { exact: true })
    await expect(items).toHaveCount(3)

    const first = await box(page, page.locator('li[data-reorder-index="0"]'))
    const last = await box(page, page.locator('li[data-reorder-index="2"]'))
    // Hold on the grip side of the first row, then drag it below the last.
    await touchDrag(
      page,
      { x: first.x + 12, y: first.y + first.height / 2 },
      { x: first.x + 12, y: last.y + last.height - 2 },
      { holdMs: 450 },
    )
    await expect
      .poll(() => items.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value)))
      .toEqual(['Charger', 'Socks', 'Passport'])
  })
})
