import { test, expect, type Page } from '@playwright/test'

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

test('guest homepage loads clubs link', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('body')).toBeVisible()
  await page.goto('/clubs')
  await expect(page.locator('body')).toContainText(/club|باشگاه/i)
})

test('athlete can login via phone OTP and view bookings', async ({ page }) => {
  await loginWithPhoneOtp(page, '09121234567', /\/athlete/)
  await page.goto('/athlete/bookings')
  await expect(page.locator('body')).toBeVisible()
})

test('profile photo upload saves avatar', async ({ page }) => {
  await loginWithPhoneOtp(page, '09121234567', /\/athlete/)

  await page.goto('/athlete/profile')
  const fileInput = page.locator('input[type="file"]')
  await expect(fileInput).toHaveCount(1)

  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9])
  const uploadPromise = page.waitForResponse((res) => res.url().includes('/api/uploads') && res.request().method() === 'POST')
  await fileInput.setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: jpeg })
  const uploadRes = await uploadPromise
  expect(uploadRes.ok()).toBeTruthy()

  await expect(page.locator('img[src*="/uploads/"]')).toBeVisible({ timeout: 15_000 })
})

test('owner can login via phone OTP and view finance', async ({ page }) => {
  await loginWithPhoneOtp(page, '09124445566', /\/owner/)
  await page.goto('/owner/finance')
  await expect(page.locator('body')).toBeVisible()
})
