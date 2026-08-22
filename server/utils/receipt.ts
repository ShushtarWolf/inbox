import { siteUrl } from './email'
import { payPath } from '#shared/payPin.ts'
import { bookingTrackingCode, receiptPath, signReceiptToken } from '#shared/receiptToken.ts'

const DEMO_SESSION_FALLBACK = 'inbox-demo-session-password-change-me'

/** Prefer RECEIPT_SIGNING_SECRET; fall back to session password. Never use the demo secret in production. */
export function receiptSigningSecret() {
  const secret = process.env.RECEIPT_SIGNING_SECRET || process.env.NUXT_SESSION_PASSWORD
  if (process.env.NODE_ENV === 'production') {
    if (!secret || secret.length < 32 || secret === DEMO_SESSION_FALLBACK) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Receipt signing secret is not configured',
      })
    }
    return secret
  }
  return secret || DEMO_SESSION_FALLBACK
}

export function receiptUrlForBooking(bookingId: string) {
  const token = signReceiptToken(bookingId, receiptSigningSecret())
  return `${siteUrl().replace(/\/$/, '')}${receiptPath(token)}`
}

export function payUrlForPin(pin: string) {
  return `${siteUrl().replace(/\/$/, '')}${payPath(pin)}`
}

export { bookingTrackingCode }
