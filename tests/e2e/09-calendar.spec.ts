import { test, expect, navigateTo, waitForView } from './fixtures'

test.describe('9 — Calendar', () => {
  test.beforeEach(async ({ vaultPage: page }) => {
    await waitForView(page, 'calendar')

    // Switch to month view for consistent grid-based tests
    const monthBtn = page.locator('button', { hasText: /^month$/i })
    if (await monthBtn.isVisible()) {
      await monthBtn.click()
      await page.waitForTimeout(500)
    }
  })

  // ─── 9.1 Event CRUD ────────────────────────────────────────────────────────

  test.describe('9.1 Event CRUD', () => {
    test('9.1.1 click day cell — create event dialog', async ({
      vaultPage: page,
    }) => {
      // Click on a day cell in the grid (today's date number)
      const today = new Date()
      const dayNumber = today.getDate().toString()
      const dayCell = page
        .locator('[role="button"]')
        .filter({ hasText: new RegExp(`^${dayNumber}$`) })
        .first()
      await dayCell.click()
      await page.waitForTimeout(500)

      // Event dialog should open in create mode
      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible({ timeout: 5_000 })
      await expect(dialog.getByText('New Event')).toBeVisible()

      // Close without saving
      await dialog.getByText('Cancel').click()
    })

    test('9.1.2 save event — verify appears on calendar', async ({
      vaultPage: page,
    }) => {
      // Use the "New event" button in the toolbar
      const newEventBtn = page.locator('button', { hasText: 'New event' })
      await newEventBtn.click()
      await page.waitForTimeout(500)

      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible({ timeout: 5_000 })

      // Fill title
      const titleInput = dialog.getByPlaceholder('Event title')
      await titleInput.fill('Team Meeting')

      // Click Create
      await dialog.getByRole('button', { name: 'Create' }).click()
      await page.waitForTimeout(1_500)

      // Event chip should appear in the calendar grid
      await expect(page.getByText('Team Meeting')).toBeVisible({ timeout: 5_000 })
    })

    test('9.1.3 edit event — change title and color', async ({
      vaultPage: page,
    }) => {
      // Create an event first
      const newEventBtn = page.locator('button', { hasText: 'New event' })
      await newEventBtn.click()
      await page.waitForTimeout(500)

      let dialog = page.locator('[role="dialog"]')
      await dialog.getByPlaceholder('Event title').fill('Original Event')
      await dialog.getByRole('button', { name: 'Create' }).click()
      await page.waitForTimeout(1_500)

      // Click the event chip to edit
      const eventChip = page.getByText('Original Event')
      await expect(eventChip).toBeVisible({ timeout: 5_000 })
      await eventChip.click()
      await page.waitForTimeout(500)

      // Edit dialog should open
      dialog = page.locator('[role="dialog"]')
      await expect(dialog.getByText('Edit Event')).toBeVisible({ timeout: 5_000 })

      // Change title
      const titleInput = dialog.getByPlaceholder('Event title')
      await titleInput.clear()
      await titleInput.fill('Updated Event')

      // Change color — click the sky color swatch
      const skyColorBtn = dialog.locator('button[aria-label="sky"]')
      await skyColorBtn.click()

      // Save
      await dialog.getByRole('button', { name: 'Save' }).click()
      await page.waitForTimeout(1_500)

      // Updated title should appear
      await expect(page.getByText('Updated Event')).toBeVisible({ timeout: 5_000 })
      await expect(page.getByText('Original Event')).not.toBeVisible()
    })

    test('9.1.4 delete event', async ({ vaultPage: page }) => {
      // Create an event
      const newEventBtn = page.locator('button', { hasText: 'New event' })
      await newEventBtn.click()
      await page.waitForTimeout(500)

      let dialog = page.locator('[role="dialog"]')
      await dialog.getByPlaceholder('Event title').fill('Event to Delete')
      await dialog.getByRole('button', { name: 'Create' }).click()
      await page.waitForTimeout(1_500)

      // Click the event chip
      const eventChip = page.getByText('Event to Delete')
      await expect(eventChip).toBeVisible({ timeout: 5_000 })
      await eventChip.click()
      await page.waitForTimeout(500)

      // Click Delete in the edit dialog
      dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible({ timeout: 5_000 })
      const deleteBtn = dialog.getByText('Delete')
      await deleteBtn.click()
      await page.waitForTimeout(1_500)

      // Event should be gone
      await expect(page.getByText('Event to Delete')).not.toBeVisible({ timeout: 5_000 })
    })

    test('9.1.5 toggle all-day', async ({ vaultPage: page }) => {
      const newEventBtn = page.locator('button', { hasText: 'New event' })
      await newEventBtn.click()
      await page.waitForTimeout(500)

      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible({ timeout: 5_000 })

      // All-day should be on by default for day-cell clicks
      const allDaySwitch = dialog.locator('[role="switch"][aria-checked]')
      await expect(allDaySwitch).toBeVisible()

      // Time inputs should NOT be visible when all-day is on
      const startTimeLabel = dialog.getByText('Start time')
      const allDayChecked = await allDaySwitch.getAttribute('aria-checked')

      if (allDayChecked === 'true') {
        await expect(startTimeLabel).not.toBeVisible()

        // Toggle all-day off
        await allDaySwitch.click()
        await page.waitForTimeout(300)

        // Now time inputs should appear
        await expect(dialog.getByText('Start time')).toBeVisible({ timeout: 3_000 })
        await expect(dialog.getByText('End time')).toBeVisible()
      } else {
        // Already off — time inputs should be visible
        await expect(startTimeLabel).toBeVisible()

        // Toggle on
        await allDaySwitch.click()
        await page.waitForTimeout(300)

        // Time inputs should disappear
        await expect(dialog.getByText('Start time')).not.toBeVisible()
      }

      await dialog.getByText('Cancel').click()
    })

    test('9.1.6 event colors — all six swatches present', async ({
      vaultPage: page,
    }) => {
      const newEventBtn = page.locator('button', { hasText: 'New event' })
      await newEventBtn.click()
      await page.waitForTimeout(500)

      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible({ timeout: 5_000 })

      const colors = ['violet', 'sky', 'emerald', 'amber', 'rose', 'slate']
      for (const color of colors) {
        const swatch = dialog.locator(`button[aria-label="${color}"]`)
        await expect(swatch).toBeVisible({ timeout: 3_000 })
      }

      // Click each color swatch to verify they're interactive
      for (const color of colors) {
        const swatch = dialog.locator(`button[aria-label="${color}"]`)
        await swatch.click()
        await page.waitForTimeout(150)
        // Active swatch should have a ring
        await expect(swatch).toHaveClass(/ring-2/)
      }

      await dialog.getByText('Cancel').click()
    })
  })

  // ─── 9.2 Month View & Navigation ───────────────────────────────────────────

  test.describe('9.2 Month View & Navigation', () => {
    test('9.2.1 navigate months — prev/next arrows', async ({
      vaultPage: page,
    }) => {
      // Get current heading
      const heading = page.locator('h1').first()
      const currentText = await heading.textContent()

      // Click Next
      const nextBtn = page.locator('button[aria-label="Next"]')
      await nextBtn.click()
      await page.waitForTimeout(500)

      const nextText = await heading.textContent()
      expect(nextText).not.toBe(currentText)

      // Click Previous twice to go one month before original
      const prevBtn = page.locator('button[aria-label="Previous"]')
      await prevBtn.click()
      await page.waitForTimeout(500)

      const backText = await heading.textContent()
      expect(backText).toBe(currentText)

      // Go one more back
      await prevBtn.click()
      await page.waitForTimeout(500)

      const furtherBackText = await heading.textContent()
      expect(furtherBackText).not.toBe(currentText)
    })

    test('9.2.2 events render as chips on correct day cells', async ({
      vaultPage: page,
    }) => {
      // Create an event on today
      const newEventBtn = page.locator('button', { hasText: 'New event' })
      await newEventBtn.click()
      await page.waitForTimeout(500)

      const dialog = page.locator('[role="dialog"]')
      await dialog.getByPlaceholder('Event title').fill('Grid Chip Test')
      await dialog.getByRole('button', { name: 'Create' }).click()
      await page.waitForTimeout(1_500)

      // The event chip should be present in the grid
      const chip = page.getByText('Grid Chip Test')
      await expect(chip).toBeVisible({ timeout: 5_000 })

      // Verify the chip is inside a day cell (a button with role="button")
      const dayCell = chip.locator('xpath=ancestor::div[@role="button"]')
      await expect(dayCell).toBeVisible()
    })

    test('9.2.5 today highlighted in grid', async ({ vaultPage: page }) => {
      // Today's date number should be inside an element with the accent background
      const today = new Date()
      const dayNumber = today.getDate().toString()

      // The today circle has bg-accent class
      const todayCircle = page.locator(
        `.bg-accent:not(button):not([role="switch"])`,
      ).filter({ hasText: new RegExp(`^${dayNumber}$`) })

      await expect(todayCircle.first()).toBeVisible({ timeout: 5_000 })
    })
  })
})
