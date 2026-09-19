import { test, expect, type Page } from '@playwright/test'

const ownerPhone = process.env.LAUNCH_OWNER_PHONE
const coachPhone = process.env.LAUNCH_COACH_PHONE

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

test.describe('approved launch mobile flows', () => {
  test.skip(!ownerPhone, 'set LAUNCH_OWNER_PHONE to run the owner mobile launch flow')
  test.use({ viewport: { width: 375, height: 812 } })

  test('owner can discover package reservation from mobile', async ({ page }) => {
    await loginWithPhoneOtp(page, ownerPhone!, /\/owner/)
    await page.goto('/owner/reserve/package')
    await expect(page.locator('body')).toContainText('رزرو بسته')
    await expect(page.getByRole('link', { name: /تقویم/ })).toBeVisible()
  })
})

test.describe('approved coach mobile flows', () => {
  test.skip(!coachPhone, 'set LAUNCH_COACH_PHONE to run the coach mobile launch flow')
  test.use({ viewport: { width: 375, height: 812 } })

  test('coach can reach schedule and session actions on mobile', async ({ page }) => {
    await loginWithPhoneOtp(page, coachPhone!, /\/coach/)
    await page.goto('/coach/schedule')
    await expect(page.locator('body')).toContainText('برنامه')
    await expect(page.locator('body')).toContainText('رزرو برای شاگرد')
  })
})
