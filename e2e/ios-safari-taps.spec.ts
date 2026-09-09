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
  // Log/dry-run autofills; if rate-limited or live SMS, pull the on-screen debug code.
  const otp = page.locator('#login-otp')
  await expect.poll(async () => {
    const value = await otp.inputValue()
    if (value) return value
    const hint = await page.locator('.text-brand-navy\\/80, [class*="debug"]').first().textContent().catch(() => '')
    const match = (hint || '').match(/\d{4,8}/)
    if (match) {
      await otp.fill(match[0]!)
      return match[0]!
    }
    const body = await page.locator('body').innerText()
    const fromBody = body.match(/(?:کد آزمایشی|debug)[^\d]*(\d{4,8})/i)
    if (fromBody?.[1]) {
      await otp.fill(fromBody[1])
      return fromBody[1]
    }
    return ''
  }, { timeout: 15_000 }).not.toEqual('')
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
    await expect(page.locator('[data-app-modal-overlay]')).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: 'بستن' }).click()
    await expect(page.locator('[data-app-modal-overlay]')).toHaveCount(0, { timeout: 10_000 })
    await page.waitForTimeout(250)

    const searchLink = page.getByRole('link', { name: 'جستجو' })
    await expect(searchLink).toBeVisible()
    await searchLink.click()
    await page.waitForURL(/\/clubs/, { timeout: 15_000 })
  })

  test('date picker modal close does not block login behind it', async ({ page }) => {
    await page.goto('/')
    await page.locator('#home-date-btn').click()
    await expect(page.locator('[data-app-modal-overlay]')).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: 'بستن' }).click()
    await expect(page.locator('[data-app-modal-overlay]')).toHaveCount(0, { timeout: 10_000 })
    await page.waitForTimeout(250)

    await page.getByRole('button', { name: 'ورود/ثبت نام' }).click()
    await expect(page.locator('[data-app-modal-overlay]')).toBeVisible({ timeout: 10_000 })
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

  test('nested crop confirm then page controls remain tappable', async ({ page }) => {
    await loginWithPhoneOtp(page, '09121234567', /\/athlete/)
    await page.goto('/athlete/profile')

    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'انتخاب تصویر' }).click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles('public/icons/icon-192.png')

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 })
    const confirmCrop = page.getByRole('button', { name: 'تأیید و بارگذاری' })
    await expect(confirmCrop).toBeEnabled({ timeout: 15_000 })
    const uploadPromise = page.waitForResponse((res) => res.url().includes('/api/uploads') && res.request().method() === 'POST')
    await confirmCrop.click()
    const uploadRes = await uploadPromise
    expect(uploadRes.ok()).toBeTruthy()

    await expect(page.locator('[data-app-modal-overlay]')).toHaveCount(0, { timeout: 15_000 })
    await page.waitForTimeout(250)

    const saveBtn = page.getByRole('button', { name: 'ذخیره' })
    await expect(saveBtn).toBeEnabled()
    await saveBtn.click()
    await expect(page.getByText('با موفقیت ذخیره شد').or(page.getByText(/خطا/))).toBeVisible({ timeout: 15_000 })
  })

  test('club confirm CTA opens sheet and close restores taps', async ({ page }) => {
    await loginWithPhoneOtp(page, '09121234567', /\/athlete/)
    await page.goto('/clubs/iust-tennis')
    await expect(page.locator('.canva-club-book-cta')).toBeVisible({ timeout: 15_000 })

    const freeSlot = page.locator('.canva-club-slot:not(.canva-club-slot-booked):not([disabled])').first()
    await expect(freeSlot).toBeVisible({ timeout: 15_000 })
    await freeSlot.click()
    await expect(freeSlot).toHaveClass(/canva-club-slot-active/)

    const cta = page.locator('.canva-club-book-cta')
    await expect(cta).toBeEnabled()
    await cta.click()

    const overlay = page.locator('[data-app-modal-overlay]')
    await expect(overlay).toBeVisible({ timeout: 10_000 })
    // Must stay open — open-click race used to dismiss immediately.
    await page.waitForTimeout(400)
    await expect(overlay).toBeVisible()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.getByRole('button', { name: 'بستن' }).click()
    await expect(overlay).toHaveCount(0, { timeout: 10_000 })
    await page.waitForTimeout(250)

    await expect(cta).toBeEnabled()
    await cta.click()
    await expect(page.locator('[data-app-modal-overlay]')).toBeVisible({ timeout: 10_000 })
  })

  test('owner account drawer close restores calendar taps', async ({ page }) => {
    await loginWithPhoneOtp(page, '09124445566', /\/owner/)
    await page.goto('/owner/calendar')
    await expect(page.locator('.canva-owner-avatar').first()).toBeVisible({ timeout: 15_000 })

    await page.locator('.canva-owner-avatar').first().click()
    await expect(page.locator('[data-account-drawer-overlay]')).toBeVisible({ timeout: 10_000 })

    await page.locator('[data-account-drawer-overlay]').getByRole('button', { name: 'بستن' }).click()
    await expect(page.locator('[data-account-drawer-overlay]')).toHaveCount(0, { timeout: 10_000 })
    await page.waitForTimeout(250)

    // Date label behind the drawer must accept taps again.
    await page.locator('.canva-cal-date-nav-label').click()
    await expect(page.locator('[data-app-modal-overlay]')).toBeVisible({ timeout: 10_000 })
  })

  test('owner more sheet close restores bottom nav taps', async ({ page }) => {
    await loginWithPhoneOtp(page, '09124445566', /\/owner/)
    await page.goto('/owner/calendar')

    const moreTab = page.getByRole('button', { name: 'بیشتر' })
    await expect(moreTab).toBeVisible({ timeout: 15_000 })
    await moreTab.click()
    await expect(page.locator('[data-app-modal-overlay]')).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: 'بستن' }).click()
    await expect(page.locator('[data-app-modal-overlay]')).toHaveCount(0, { timeout: 10_000 })
    await page.waitForTimeout(250)

    const financeTab = page.getByRole('link', { name: 'مالی' })
    await expect(financeTab).toBeVisible()
    await financeTab.click()
    await page.waitForURL(/\/owner\/finance/, { timeout: 15_000 })
  })

  test('owner packages create sheet close restores page CTA', async ({ page }) => {
    await loginWithPhoneOtp(page, '09124445566', /\/owner/)
    await page.goto('/owner/packages')
    const addBtn = page.getByRole('button', { name: '+ پکیج' })
    // Packages may be gated off in some envs — skip softly.
    if (!(await addBtn.isVisible().catch(() => false))) {
      test.skip()
      return
    }
    await addBtn.click()
    await expect(page.locator('[data-app-modal-overlay]')).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: 'بستن' }).click()
    await expect(page.locator('[data-app-modal-overlay]')).toHaveCount(0, { timeout: 10_000 })
    await page.waitForTimeout(250)

    await expect(addBtn).toBeEnabled()
    await addBtn.click()
    await expect(page.locator('[data-app-modal-overlay]')).toBeVisible({ timeout: 10_000 })
  })
})
