import { test, expect } from '@playwright/test'

test('guest homepage loads clubs link', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('body')).toBeVisible()
  await page.goto('/clubs')
  await expect(page.locator('body')).toContainText(/club|باشگاه/i)
})

test('athlete can login and view bookings', async ({ page }) => {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill('athlete@inbox.local')
  await page.locator('input[type="password"]').fill('demo1234')
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/athlete/)
  await page.goto('/athlete/bookings')
  await expect(page.locator('body')).toBeVisible()
})

test('owner can login and view finance', async ({ page }) => {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill('owner@inbox.local')
  await page.locator('input[type="password"]').fill('demo1234')
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/owner/)
  await page.goto('/owner/finance')
  await expect(page.locator('body')).toBeVisible()
})
