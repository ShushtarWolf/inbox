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
 * Owner desk checkout (pay confirm) — cash / pay-link CTAs must fire API reserve.
 * WebKit mobile viewport (iOS Safari regression guard).
 */
test.describe('owner desk pay confirm', () => {
  test.beforeEach(async ({ page }) => {
    await loginOwnerPassword(page)
    await expect(page.locator('.canva-cal-grid-cell').first()).toBeVisible({ timeout: 20_000 })
  })

  test('past free slot → reserve → pay cash completes', async ({ page }) => {
    const freeCell = page.locator(
      'button.canva-cal-grid-cell.slot-free, button.canva-cal-grid-cell.slot-past',
    ).first()
    await freeCell.click()
    await expect(page.locator('.canva-selection-bar')).toBeVisible({ timeout: 10_000 })
    await page.locator('.canva-selection-bar-btn-primary').click()
    await expect(page.locator('[data-app-modal-overlay]')).toBeVisible({ timeout: 10_000 })
    await page.locator('#owner-reserve-guest-name, #owner-guest-name').first().fill('تست')
    await page.locator('#owner-reserve-guest-mobile, #owner-guest-mobile').first().fill('09121234567')
    await page.locator('.canva-sheet-submit').filter({ hasText: /ثبت رزرو/ }).click()
    await expect(page.locator('.canva-desk-pay-panel').getByRole('heading', { name: 'تایید رزرو میز' })).toBeVisible({ timeout: 10_000 })
    const reservePromise = page.waitForResponse(
      (res) => res.url().includes('/api/owner/reserve') && res.request().method() === 'POST',
      { timeout: 15_000 },
    )
    await page.getByRole('button', { name: 'پرداخت نقدی' }).click()
    const reserveRes = await reservePromise
    expect(reserveRes.ok()).toBeTruthy()
  })
})
