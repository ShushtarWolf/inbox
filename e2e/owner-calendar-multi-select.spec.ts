import { test, expect, type Page } from '@playwright/test'

async function loginOwnerPassword(page: Page) {
  const res = await page.request.post('/api/auth/login', {
    data: { email: 'owner@inbox.local', password: 'demo1234' },
  })
  expect(res.ok()).toBeTruthy()
  await page.goto('/owner/calendar')
  await page.waitForURL(/\/owner/)
}

/**
 * IB-56: owner day calendar must allow multi-selecting consecutive FREE/past hours on mobile.
 */
test.describe('owner calendar multi-select', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test.beforeEach(async ({ page }) => {
    await loginOwnerPassword(page)
    await expect(page.locator('.canva-cal-grid-cell').first()).toBeVisible({ timeout: 20_000 })
  })

  test('two taps add two slots without replacing the first selection', async ({ page }) => {
    const freeCells = page.locator('button.canva-cal-grid-cell.slot-free, button.canva-cal-grid-cell.slot-past')
    await expect(freeCells.first()).toBeVisible()
    const count = await freeCells.count()
    test.skip(count < 2, 'calendar has fewer than two free/past cells in fixture')

    const first = freeCells.nth(0)
    const second = freeCells.nth(1)
    await first.click()
    await expect(page.locator('.canva-selection-bar')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.canva-selection-bar')).toContainText('(1)')

    await second.click()
    await expect(page.locator('.canva-selection-bar')).toContainText('(2)', { timeout: 5_000 })

    const pressed = page.locator('button.canva-cal-grid-cell[aria-pressed="true"]')
    await expect(pressed).toHaveCount(2)
  })
})