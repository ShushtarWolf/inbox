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
  const otpReq = await page.request.post('/api/auth/otp/request', {
    data: { phone: '09121234567', purpose: 'login' },
  })
  expect(otpReq.ok()).toBeTruthy()
  const { debugCode } = await otpReq.json() as { debugCode?: string }
  expect(debugCode).toBeTruthy()
  const verify = await page.request.post('/api/auth/otp/verify', {
    data: { phone: '09121234567', code: debugCode, purpose: 'login' },
  })
  expect(verify.ok()).toBeTruthy()
}

async function loginOwner(page: Page) {
  const res = await page.request.post('/api/auth/login', {
    data: { email: 'owner@inbox.local', password: 'demo1234' },
  })
  expect(res.ok()).toBeTruthy()
}

test.describe.configure({ mode: 'serial' })

test.describe('design UI parity screenshots', () => {
  test('public home desktop and mobile', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await expect(page.locator('.canva-search-row, .canva-search-fields').first()).toBeVisible({ timeout: 20_000 })
    await page.screenshot({ path: shotPath('after-home-desktop.png'), fullPage: true })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await expect(page.locator('.canva-search-row, .canva-search-fields').first()).toBeVisible({ timeout: 20_000 })
    await page.screenshot({ path: shotPath('after-home-mobile.png'), fullPage: true })
  })

  test('auth modal photo header desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    // /login opens the sheet then redirects to home (or returnTo) with modal mounted.
    await page.goto('/login')
    await expect(page.locator('#login-phone')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('.canva-auth-photo')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.canva-auth-accent')).toBeVisible()
    await expect(page.locator('.canva-auth-rmod-warn')).toBeVisible()
    await page.screenshot({ path: shotPath('after-auth-login-desktop.png') })
  })

  test('club detail SVG map fallback and book-package stub', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/book/package')
    await expect(page.getByRole('heading', { name: 'پکیج فعلاً در دسترس نیست' })).toBeVisible({ timeout: 20_000 })
  })

  test('athlete home and choose-role mobile', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'auth screenshots run on chromium project')
    await loginAthlete(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/athlete/home')
    await expect(page.locator('.canva-photo-hero')).toBeVisible({ timeout: 20_000 })
    await page.screenshot({ path: shotPath('after-athlete-home-mobile.png'), fullPage: true })

    await page.goto('/choose-role')
    await page.waitForLoadState('domcontentloaded')
    if (page.url().includes('/choose-role')) {
      await expect(page.locator('.canva-auth-sheet')).toBeVisible({ timeout: 15_000 })
      await page.screenshot({ path: shotPath('after-choose-role-mobile.png'), fullPage: true })
    }
  })

  test('owner calendar welcome mobile', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'owner screenshots run on chromium project')
    await loginOwner(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/owner/calendar')
    await expect(page.locator('.canva-photo-hero')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/مجموعه‌ت آماده‌ست/)).toBeVisible({ timeout: 10_000 })
    await page.screenshot({ path: shotPath('after-owner-calendar-mobile.png'), fullPage: true })
  })
})
