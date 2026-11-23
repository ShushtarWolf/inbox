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

  test('after clear + scroll, same-hour cells on other courts can be re-selected (IB-56)', async ({ page }) => {
    const selectable = page.locator('button.canva-cal-grid-cell:has(.canva-cal-grid-check)')
    const count = await selectable.count()
    test.skip(count < 3, 'need at least three free/past selectable cells')

    await selectable.nth(0).click()
    await selectable.nth(1).click()
    await expect(page.locator('.canva-selection-bar')).toContainText('(2)', { timeout: 10_000 })

    await page.getByRole('button', { name: 'پاک کردن انتخاب', exact: true }).click()
    await expect(page.locator('.canva-selection-bar')).toHaveCount(0)

    const lastCell = selectable.last()
    await lastCell.scrollIntoViewIfNeeded()
    await lastCell.click()
    await expect(page.locator('.canva-selection-bar')).toContainText('(1)', { timeout: 10_000 })

    const firstCell = selectable.nth(0)
    await firstCell.scrollIntoViewIfNeeded()
    await firstCell.click()
    await expect(page.locator('.canva-selection-bar')).toContainText('(2)', { timeout: 5_000 })
  })

  test('selection bar is in document flow (not a fixed overlay on the grid)', async ({ page }) => {
    const first = page.locator('.canva-cal-grid-cell:has(.canva-cal-grid-check)').first()
    await first.click()
    const bar = page.locator('.canva-selection-bar-inflow')
    await expect(bar).toBeVisible()
    const position = await bar.evaluate((el) => getComputedStyle(el).position)
    expect(position).toBe('relative')
    const gridBottom = await page.locator('.canva-cal-grid').evaluate((el) => el.getBoundingClientRect().bottom)
    const barTop = await bar.evaluate((el) => el.getBoundingClientRect().top)
    expect(barTop).toBeGreaterThanOrEqual(gridBottom - 4)
  })
})