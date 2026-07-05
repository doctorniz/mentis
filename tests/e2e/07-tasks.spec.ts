import { test, expect, navigateTo, waitForView } from './fixtures'

test.describe('7 — Task Manager', () => {
  test.beforeEach(async ({ vaultPage: page }) => {
    await waitForView(page, 'tasks')
  })

  // ─── 7.1 Quick-Add Parsing ──────────────────────────────────────────────────

  test.describe('7.1 Quick-Add Parsing', () => {
    test('7.1.1 "Buy milk !1 #grocery >today" parses priority, tag, due', async ({
      vaultPage: page,
    }) => {
      const input = page.getByPlaceholder('Add a task...')
      await input.fill('Buy milk !1 #grocery >today')

      // Preview tokens should appear below the input
      await expect(page.getByText('Urgent')).toBeVisible({ timeout: 3_000 })
      await expect(page.getByText('#grocery')).toBeVisible()

      const today = new Date()
      const yyyy = today.getFullYear()
      const mm = String(today.getMonth() + 1).padStart(2, '0')
      const dd = String(today.getDate()).padStart(2, '0')
      const todayStr = `${yyyy}-${mm}-${dd}`
      await expect(page.getByText(todayStr)).toBeVisible()

      // Submit
      await input.press('Enter')
      await page.waitForTimeout(1_000)

      // Task should appear in the list
      await expect(page.getByText('Buy milk')).toBeVisible({ timeout: 5_000 })
    })

    test('7.1.2 "Weekly standup every monday" sets repeat=weekly', async ({ vaultPage: page }) => {
      const input = page.getByPlaceholder('Add a task...')
      await input.fill('Weekly standup every monday')

      // Weekly repeat token should appear in preview
      await expect(page.getByText(/Weekly/)).toBeVisible({ timeout: 3_000 })
      await expect(page.getByText(/Monday/)).toBeVisible()

      await input.press('Enter')
      await page.waitForTimeout(1_000)

      await expect(page.getByText('Weekly standup')).toBeVisible({ timeout: 5_000 })
    })

    test('7.1.4 "Call dentist >tomorrow" sets due to tomorrow', async ({ vaultPage: page }) => {
      const input = page.getByPlaceholder('Add a task...')
      await input.fill('Call dentist >tomorrow')

      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const yyyy = tomorrow.getFullYear()
      const mm = String(tomorrow.getMonth() + 1).padStart(2, '0')
      const dd = String(tomorrow.getDate()).padStart(2, '0')
      const tomorrowStr = `${yyyy}-${mm}-${dd}`
      await expect(page.getByText(tomorrowStr)).toBeVisible({ timeout: 3_000 })

      await input.press('Enter')
      await page.waitForTimeout(1_000)

      await expect(page.getByText('Call dentist')).toBeVisible({ timeout: 5_000 })
      // Due badge should show "Tomorrow"
      await expect(page.getByText('Tomorrow')).toBeVisible()
    })

    test('7.1.9 priority only accepts 1–4', async ({ vaultPage: page }) => {
      const input = page.getByPlaceholder('Add a task...')

      // Valid priority !2 should show "High"
      await input.fill('Test task !2')
      await expect(page.getByText('High')).toBeVisible({ timeout: 3_000 })

      // !5 is out of range — no priority token should appear
      await input.clear()
      await input.fill('Test task !5')
      await page.waitForTimeout(500)
      await expect(page.getByText('Urgent')).not.toBeVisible()
      await expect(page.getByText('High')).not.toBeVisible()
      await expect(page.getByText('Low')).not.toBeVisible()
    })
  })

  // ─── 7.2 Smart Filters ─────────────────────────────────────────────────────

  test.describe('7.2 Smart Filters', () => {
    test('7.2.1 Inbox shows tasks with no list', async ({ vaultPage: page }) => {
      // Add a task to Inbox (no list)
      const input = page.getByPlaceholder('Add a task...')
      await input.fill('Inbox task test')
      await input.press('Enter')
      await page.waitForTimeout(1_000)

      // Click Inbox in sidebar
      const inboxBtn = page.locator('button', { hasText: 'Inbox' }).first()
      await inboxBtn.click()
      await page.waitForTimeout(500)

      await expect(page.getByText('Inbox task test')).toBeVisible({ timeout: 5_000 })
    })

    test('7.2.2 Today shows tasks due today', async ({ vaultPage: page }) => {
      // Add a task due today
      const input = page.getByPlaceholder('Add a task...')
      await input.fill('Due today task >today')
      await input.press('Enter')
      await page.waitForTimeout(1_000)

      // Click "Today" smart filter in sidebar
      const todayBtn = page.locator('button', { hasText: 'Today' }).first()
      await todayBtn.click()
      await page.waitForTimeout(500)

      await expect(page.getByText('Due today task')).toBeVisible({ timeout: 5_000 })
    })
  })

  // ─── 7.3 Task Operations ───────────────────────────────────────────────────

  test.describe('7.3 Task Operations', () => {
    test('7.3.1 create task — appears in list', async ({ vaultPage: page }) => {
      const input = page.getByPlaceholder('Add a task...')
      await input.fill('A brand new task')
      await input.press('Enter')
      await page.waitForTimeout(1_000)

      await expect(page.getByText('A brand new task')).toBeVisible({ timeout: 5_000 })
    })

    test('7.3.2 check task done — status changes', async ({ vaultPage: page }) => {
      // Create a task first
      const input = page.getByPlaceholder('Add a task...')
      await input.fill('Task to complete')
      await input.press('Enter')
      await page.waitForTimeout(1_000)

      // Find the task row and its toggle (checkbox) button
      const taskText = page.getByText('Task to complete')
      await expect(taskText).toBeVisible({ timeout: 5_000 })

      const taskRow = taskText.locator('..')
      const toggleBtn = taskRow.locator('button[aria-label="Mark complete"]')
      await toggleBtn.click()
      await page.waitForTimeout(1_000)

      // Task should have line-through styling when done
      await expect(taskText).toHaveClass(/line-through/)
    })

    test('7.3.3 uncheck task — status reverts', async ({ vaultPage: page }) => {
      // Create and complete a task
      const input = page.getByPlaceholder('Add a task...')
      await input.fill('Task to uncomplete')
      await input.press('Enter')
      await page.waitForTimeout(1_000)

      const taskText = page.getByText('Task to uncomplete')
      await expect(taskText).toBeVisible({ timeout: 5_000 })

      // Mark complete
      const taskRow = taskText.locator('..')
      const completeBtn = taskRow.locator('button[aria-label="Mark complete"]')
      await completeBtn.click()
      await page.waitForTimeout(500)

      // Now mark incomplete
      const incompleteBtn = taskRow.locator('button[aria-label="Mark incomplete"]')
      await incompleteBtn.click()
      await page.waitForTimeout(500)

      // Should no longer have line-through
      await expect(taskText).not.toHaveClass(/line-through/)
    })

    test('7.3.4 delete task — removed from list', async ({ vaultPage: page }) => {
      const input = page.getByPlaceholder('Add a task...')
      await input.fill('Task to delete')
      await input.press('Enter')
      await page.waitForTimeout(1_000)

      const taskText = page.getByText('Task to delete')
      await expect(taskText).toBeVisible({ timeout: 5_000 })

      // Hover over the task to show action buttons
      const taskRow = taskText.locator('xpath=ancestor::div[@role="button"]')
      await taskRow.hover()
      await page.waitForTimeout(300)

      // Click delete
      const deleteBtn = taskRow.locator('button[aria-label="Delete task"]')
      await deleteBtn.click()
      await page.waitForTimeout(1_000)

      await expect(taskText).not.toBeVisible({ timeout: 5_000 })
    })

    test('7.3.7 create custom list — subfolder created', async ({ vaultPage: page }) => {
      // Click "Add list" in the sidebar
      const addListBtn = page.getByText('Add list')
      await addListBtn.click()
      await page.waitForTimeout(300)

      // Fill in the new list name
      const listInput = page.getByPlaceholder('List name')
      await listInput.fill('My Project')
      await listInput.press('Enter')
      await page.waitForTimeout(1_000)

      // The new list should appear in the sidebar
      await expect(page.getByText('My Project')).toBeVisible({ timeout: 5_000 })
    })
  })

  // ─── 7.4 Recurring Tasks ───────────────────────────────────────────────────

  test.describe('7.4 Recurring Tasks', () => {
    test.fixme('7.4.1 complete repeating task — due rolls forward', async ({ vaultPage: page }) => {
      // Create a recurring task
      const input = page.getByPlaceholder('Add a task...')
      await input.fill('Standup every monday')
      await input.press('Enter')
      await page.waitForTimeout(1_000)

      const taskText = page.getByText('Standup')
      await expect(taskText).toBeVisible({ timeout: 5_000 })

      // Click the task to open detail dialog
      const taskRow = taskText.locator('xpath=ancestor::div[@role="button"]')
      await taskRow.click()
      await page.waitForTimeout(500)

      // Note the current due date in the dialog
      const dueDateInput = page.locator('[role="dialog"]').locator('input[type="date"]')
      const dueBefore = await dueDateInput.inputValue()

      // Close dialog
      const cancelBtn = page.locator('[role="dialog"]').getByText('Cancel')
      await cancelBtn.click()
      await page.waitForTimeout(300)

      // Toggle complete — should roll due forward, not mark done
      const toggleBtn = taskRow.locator(
        'button[aria-label="Mark complete"], button[aria-label="Mark incomplete"]',
      )
      await toggleBtn.click()
      await page.waitForTimeout(1_500)

      // Re-open detail dialog
      await taskRow.click()
      await page.waitForTimeout(500)

      const dueAfter = await page
        .locator('[role="dialog"]')
        .locator('input[type="date"]')
        .inputValue()

      // Due should have moved forward (later date)
      expect(dueAfter > dueBefore).toBe(true)
    })
  })
})
