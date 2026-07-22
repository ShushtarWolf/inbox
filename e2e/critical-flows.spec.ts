import { test, expect } from '@playwright/test'

test('guest homepage loads clubs link', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('body')).toBeVisible()
  await page.goto('/clubs')
  await expect(page.locator('body')).toContainText(/club|باشگاه/i)
})

test('athlete can login via phone OTP and view bookings', async ({ page }) => {
  await page.goto('/login')
  await page.locator('#login-phone').fill('09121234567')
  await page.locator('button[type="submit"]').click()
  await expect(page.locator('#login-otp')).toBeVisible({ timeout: 15_000 })
  // Log SMS mode auto-fills debugCode into the OTP field
  await expect(page.locator('#login-otp')).not.toHaveValue('')
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/athlete/)
  await page.goto('/athlete/bookings')
  await expect(page.locator('body')).toBeVisible()
})

test('owner can login via phone OTP and view finance', async ({ page }) => {
  await page.goto('/login')
  await page.locator('#login-phone').fill('09124445566')
  await page.locator('button[type="submit"]').click()
  await expect(page.locator('#login-otp')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('#login-otp')).not.toHaveValue('')
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/owner/)
  await page.goto('/owner/finance')
  await expect(page.locator('body')).toBeVisible()
})
