import { test, expect, type Page } from '@playwright/test'
import {
  E2E_ATHLETE_PHONE,
  loginAthleteViaApi,
  loginAthleteWithPhoneOtpUi,
} from './helpers/phone-otp.ts'

async function loginOwnerPassword(page: Page) {
  const res = await page.request.post('/api/auth/login', {
    data: { email: 'owner@inbox.local', password: 'demo1234' },
  })
  expect(res.ok()).toBeTruthy()
  await page.goto('/owner/calendar')
  await page.waitForURL(/\/owner/)
}

test('guest homepage loads clubs link', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('body')).toBeVisible()
  await page.goto('/clubs')
  await expect(page.locator('body')).toContainText(/club|باشگاه/i)
})

test('athlete can login via phone OTP and view bookings', async ({ page }) => {
  await loginAthleteWithPhoneOtpUi(page, E2E_ATHLETE_PHONE, /\/athlete/)
  await page.goto('/athlete/bookings')
  await expect(page.locator('body')).toBeVisible()
})

test('profile photo upload saves avatar', async ({ page }) => {
  test.setTimeout(120_000)
  await loginAthleteViaApi(page)
  await page.goto('/athlete/profile', { waitUntil: 'networkidle' })
  await expect(page.getByRole('button', { name: 'انتخاب تصویر' })).toBeVisible({ timeout: 20_000 })
  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'انتخاب تصویر' }).click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles('public/icons/icon-192.png')

  const confirmCrop = page.getByRole('button', { name: 'تأیید و بارگذاری' })
  await expect(confirmCrop).toBeEnabled({ timeout: 20_000 })
  const uploadPromise = page.waitForResponse(
    (res) => res.url().includes('/api/uploads') && res.request().method() === 'POST',
    { timeout: 60_000 },
  )
  await confirmCrop.click()
  const uploadRes = await uploadPromise
  expect(uploadRes.ok()).toBeTruthy()

  await expect(page.locator('img[src*="/uploads/athlete/"]').first()).toBeVisible({ timeout: 20_000 })
})

test('owner can login via password and view finance', async ({ page }) => {
  await loginOwnerPassword(page)
  await page.goto('/owner/finance')
  await expect(page.locator('body')).toBeVisible()
})
