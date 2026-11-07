import { expect, type APIRequestContext, type Page } from '@playwright/test'

/** Seed athlete (prisma/seed.ts) — shared across e2e specs unless overridden. */
export const E2E_ATHLETE_PHONE = '09121234567'

type OtpRequestJson = { debugCode?: string }
type OtpErrorJson = { data?: { retryAfterSec?: number } }

/**
 * Request login OTP via API (SMS_PROVIDER=log → debugCode). Retries once on resend cooldown.
 */
export async function requestLoginOtpCode(
  request: APIRequestContext,
  phone: string = E2E_ATHLETE_PHONE,
): Promise<string> {
  const maxAttempts = 3
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const otpReq = await request.post('/api/auth/otp/request', {
      data: { phone, purpose: 'login' },
    })
    if (otpReq.ok()) {
      const body = await otpReq.json() as OtpRequestJson
      const code = body.debugCode
      if (!code) throw new Error('otp/request missing debugCode (is SMS_PROVIDER=log?)')
      return code
    }
    if (otpReq.status() === 429 && attempt < maxAttempts - 1) {
      const body = await otpReq.json().catch(() => ({})) as OtpErrorJson
      const retrySec = Math.max(1, Number(body?.data?.retryAfterSec) || 2)
      await new Promise((resolve) => setTimeout(resolve, (retrySec + 1) * 1000))
      continue
    }
    const text = await otpReq.text()
    throw new Error(`otp/request failed (${otpReq.status()}): ${text}`)
  }
  throw new Error('otp/request failed after retries')
}

export async function verifyLoginOtp(
  request: APIRequestContext,
  phone: string,
  code: string,
) {
  const verify = await request.post('/api/auth/otp/verify', {
    data: { phone, code, purpose: 'login' },
  })
  if (!verify.ok()) {
    throw new Error(`otp/verify failed (${verify.status()}): ${await verify.text()}`)
  }
}

/** Establish athlete session cookies without driving the login UI (avoids resend-cooldown flakes). */
export async function loginAthleteViaApi(page: Page, phone: string = E2E_ATHLETE_PHONE) {
  const code = await requestLoginOtpCode(page.request, phone)
  await verifyLoginOtp(page.request, phone, code)
}

/** Drive login UI; waits for otp/request so CI does not race the OTP field. */
export async function loginAthleteWithPhoneOtpUi(
  page: Page,
  phone: string,
  destination: RegExp,
) {
  await page.goto('/login')
  await expect(page.locator('#login-phone')).toBeVisible({ timeout: 15_000 })
  await page.locator('#login-phone').fill(phone)
  const otpMatcher = (res: { url: () => string; request: () => { method: () => string } }) => (
    res.url().includes('/api/auth/otp/request') && res.request().method() === 'POST'
  )
  let otpResOk = false
  for (let attempt = 0; attempt < 3 && !otpResOk; attempt++) {
    const [otpRes] = await Promise.all([
      page.waitForResponse(otpMatcher, { timeout: 20_000 }),
      page.locator('button[type="submit"]').click(),
    ])
    if (otpRes.ok()) {
      otpResOk = true
      break
    }
    if (otpRes.status() === 429 && attempt < 2) {
      const body = await otpRes.json().catch(() => ({})) as OtpErrorJson
      const retrySec = Math.max(1, Number(body?.data?.retryAfterSec) || 2)
      await page.waitForTimeout((retrySec + 1) * 1000)
      continue
    }
    const body = await otpRes.text()
    throw new Error(`otp/request failed (${otpRes.status()}): ${body}`)
  }
  expect(otpResOk).toBeTruthy()
  await expect(page.locator('#login-otp')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('#login-otp')).not.toHaveValue('')
  await page.locator('button[type="submit"]').click()
  await page.getByRole('button', { name: 'متوجه شدم' }).click({ timeout: 15_000 })
  await page.waitForURL(destination, { timeout: 20_000 })
}
