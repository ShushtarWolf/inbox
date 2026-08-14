import { createError } from 'h3'
import { isSyntheticPhoneEmail } from '#shared/phone.ts'

const DEMO_EMAIL_SUFFIX = '@inbox.local'

/** Seed/demo *@inbox.local accounts — not OTP synthetic emails (phone.*@users.inbox.local). */
export function isDemoEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase()
  if (isSyntheticPhoneEmail(normalized)) return false
  return normalized.endsWith(DEMO_EMAIL_SUFFIX)
}

/** Demo @inbox.local accounts are blocked in production unless explicitly allowed (CI). */
export function demoAuthAllowed(): boolean {
  return process.env.ALLOW_DEMO_AUTH === 'true'
}

export function rejectDemoEmailInProduction(email: string): void {
  if (process.env.NODE_ENV === 'production' && isDemoEmail(email) && !demoAuthAllowed()) {
    throw createError({ statusCode: 403, statusMessage: 'Demo accounts are not available' })
  }
}
