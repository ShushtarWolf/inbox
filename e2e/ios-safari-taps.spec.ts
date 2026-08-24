import { test, expect } from '@playwright/test'

/**
 * WebKit-only: catches iOS Safari ghost overlay / tap-barrier regressions
 * (Chromium often passes when Safari fails).
 */
test.describe('iOS Safari tap guard', () => {
  test('auth modal close does not block search behind it', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.canva-home-chrome')).toBeVisible({ timeout: 15_000 })

    const loginBtn = page.getByRole('button', { name: 'ورود/ثبت نام' })
    await loginBtn.click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: 'بستن' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 10_000 })

    const searchLink = page.getByRole('link', { name: 'جستجو' })
    await expect(searchLink).toBeVisible()
    await searchLink.click()
    await page.waitForURL(/\/clubs/, { timeout: 15_000 })
  })

  test('date picker modal close does not block login behind it', async ({ page }) => {
    await page.goto('/')
    await page.locator('#home-date-btn').click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: 'بستن' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 10_000 })

    await page.getByRole('button', { name: 'ورود/ثبت نام' }).click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 })
  })
})
