import type { APIRequestContext, Page } from '@playwright/test'

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
