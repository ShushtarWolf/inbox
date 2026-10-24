import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const ARTIFACT_DIR = process.env.DESIGN_PARITY_SHOT_DIR
  || path.join(process.cwd(), 'artifacts', 'design-ui-parity')

function shotPath(name: string) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true })
  return path.join(ARTIFACT_DIR, name)
}

async function loginAthlete(page: Page) {
  await page.goto('/login')
  await page.locator('#login-phone').fill('09121234567')
  await page.locator('button[type="submit"]').click()
  await expect(page.locator('#login-otp')).toBeVisible({ timeout: 15_000 })
  await page.locator('button[type="submit"]').click()
  await page.getByRole('button', { name: 'متوجه شدم' }).click({ timeout: 15_000 })
  await page.waitForURL(/\/athlete/)
}

async function loginOwner(page: Page) {
  const res = await page.request.post('/api/auth/login', {
    data: { email: 'owner@inbox.local', password: 'demo1234' },
  })
  expect(res.ok()).toBeTruthy()
}

test.describe('design UI parity screenshots', () => {
  test('public home desktop and mobile', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await expect(page.locator('.canva-home-trust-strip')).toBeVisible({ timeout: 20_000 })
    await page.screenshot({ path: shotPath('after-home-desktop.png'), fullPage: true })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await expect(page.locator('.canva-search-row, .canva-search-fields').first()).toBeVisible({ timeout: 20_000 })
    await page.screenshot({ path: shotPath('after-home-mobile.png'), fullPage: true })
  })

  test('auth modal photo header desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await page.getByRole('button', { name: 'ورود/ثبت نام' }).click()
    await expect(page.locator('.canva-auth-photo')).toBeVisible({ timeout: 10_000 })
    await page.screenshot({ path: shotPath('after-auth-login-desktop.png') })
  })

  test('athlete home and choose-role mobile', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'auth screenshots run on chromium project')
    await loginAthlete(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/athlete/home')
    await expect(page.locator('.canva-photo-hero')).toBeVisible({ timeout: 20_000 })
    await page.screenshot({ path: shotPath('after-athlete-home-mobile.png'), fullPage: true })

    await page.goto('/choose-role')
    await expect(page.locator('.canva-auth-sheet')).toBeVisible({ timeout: 15_000 })
    await page.screenshot({ path: shotPath('after-choose-role-mobile.png'), fullPage: true })
  })

  test('owner calendar welcome mobile', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'owner screenshots run on chromium project')
    await loginOwner(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/owner/calendar')
    await expect(page.locator('.canva-photo-hero')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('مجموعه‌ت آماده‌ست')).toBeVisible({ timeout: 10_000 })
    await page.screenshot({ path: shotPath('after-owner-calendar-mobile.png'), fullPage: true })
  })
})
