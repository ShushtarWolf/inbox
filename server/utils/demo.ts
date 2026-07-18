import { createError } from 'h3'

const DEMO_EMAIL_SUFFIX = '@inbox.local'

export function isDemoEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(DEMO_EMAIL_SUFFIX)
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
