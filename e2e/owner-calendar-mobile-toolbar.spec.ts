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
 * IB-31: mobile owner calendar day toolbar (مسدود / رزرو) must stay inside the phone shell.
 */
test.describe('owner calendar mobile toolbar', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test.beforeEach(async ({ page }) => {
    await loginOwnerPassword(page)
    await expect(page.locator('.canva-cal-date-fabs')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('.canva-cal-grid-cell').first()).toBeVisible({ timeout: 20_000 })
  })

  test('block and reserve FABs are fully visible in RTL phone shell', async ({ page }) => {
    const shell = page.locator('main').first()
    const blockBtn = page.locator('.canva-cal-fab-block')
    const reserveBtn = page.locator('.canva-cal-fab-reserve')

    await expect(blockBtn).toBeVisible()
    await expect(reserveBtn).toBeVisible()

    const shellBox = await shell.boundingBox()
    const blockBox = await blockBtn.boundingBox()
    const reserveBox = await reserveBtn.boundingBox()
    expect(shellBox).toBeTruthy()
    expect(blockBox).toBeTruthy()
    expect(reserveBox).toBeTruthy()

    const shellLeft = shellBox!.x
    const shellRight = shellBox!.x + shellBox!.width

    for (const box of [blockBox!, reserveBox!]) {
      expect(box.x).toBeGreaterThanOrEqual(shellLeft - 1)
      expect(box.x + box.width).toBeLessThanOrEqual(shellRight + 1)
    }

    const clipRatio = await reserveBtn.evaluate((el) => {
      const rect = el.getBoundingClientRect()
      return rect.width / (el as HTMLElement).offsetWidth
    })
    expect(clipRatio).toBeGreaterThan(0.95)
  })
})