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
 * Owner calendar day view: bulk مسدود / رزرو live in the selection bar (not disabled date-row FABs).
 */
test.describe('owner calendar mobile toolbar', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test.beforeEach(async ({ page }) => {
    await loginOwnerPassword(page)
    await expect(page.locator('.canva-cal-grid-cell').first()).toBeVisible({ timeout: 20_000 })
  })

  test('reserve and block actions appear in selection bar after picking a slot', async ({ page }) => {
    await expect(page.locator('.canva-cal-date-fabs')).toHaveCount(0)

    const freeCell = page.locator('.canva-cal-grid-cell:has(.canva-cal-grid-check)').first()
    await expect(freeCell).toBeVisible({ timeout: 20_000 })
    await freeCell.click()

    const bar = page.locator('.canva-selection-bar')
    await expect(bar).toBeVisible()
    await expect(bar.getByRole('button', { name: 'رزرو', exact: true })).toBeVisible()
    await expect(bar.getByRole('button', { name: 'مسدود', exact: true })).toBeVisible()

    const shell = page.locator('main').first()
    const shellBox = await shell.boundingBox()
    const reserveBox = await bar.getByRole('button', { name: 'رزرو', exact: true }).boundingBox()
    expect(shellBox).toBeTruthy()
    expect(reserveBox).toBeTruthy()
    expect(reserveBox!.x).toBeGreaterThanOrEqual(shellBox!.x - 1)
    expect(reserveBox!.x + reserveBox!.width).toBeLessThanOrEqual(shellBox!.x + shellBox!.width + 1)
  })
})