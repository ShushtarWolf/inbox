import { test, expect, type Page } from '@playwright/test'

/**
 * WebKit-only: catches iOS Safari ghost overlay / tap-barrier regressions
 * (Chromium often passes when Safari fails).
 */
async function loginWithPhoneOtp(page: Page, phone: string, destination: RegExp) {
  await page.goto('/login')
  await expect(page.locator('#login-phone')).toBeVisible({ timeout: 15_000 })
  await page.locator('#login-phone').fill(phone)
  await page.locator('button[type="submit"]').click()
  await expect(page.locator('#login-otp')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('#login-otp')).not.toHaveValue('')
  await page.locator('button[type="submit"]').click()
  await page.getByRole('button', { name: 'متوجه شدم' }).click({ timeout: 15_000 })
  await page.waitForURL(destination)
}

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

  test('avatar crop close does not block profile save behind it', async ({ page }) => {
    await loginWithPhoneOtp(page, '09121234567', /\/athlete/)
    await page.goto('/athlete/profile')

    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'انتخاب تصویر' }).click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles('public/icons/icon-192.png')

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: 'انصراف' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 10_000 })

    // Leave transition (~200ms) must not leave a ghost full-screen hit target.
    await page.waitForTimeout(250)
    const saveBtn = page.getByRole('button', { name: 'ذخیره' })
    await expect(saveBtn).toBeEnabled()
    await saveBtn.click()
    await expect(page.getByText('با موفقیت ذخیره شد').or(page.getByText(/خطا/))).toBeVisible({ timeout: 15_000 })
  })
})
