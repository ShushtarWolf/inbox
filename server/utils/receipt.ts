import { siteUrl } from './email'
import { payPath } from '#shared/payPin.ts'
import { bookingTrackingCode, receiptPath, signReceiptToken } from '#shared/receiptToken.ts'

export function receiptSigningSecret() {
  return process.env.NUXT_SESSION_PASSWORD || 'inbox-demo-session-password-change-me'
}

export function receiptUrlForBooking(bookingId: string) {
  const token = signReceiptToken(bookingId, receiptSigningSecret())
  return `${siteUrl().replace(/\/$/, '')}${receiptPath(token)}`
}

export function payUrlForPin(pin: string) {
  return `${siteUrl().replace(/\/$/, '')}${payPath(pin)}`
}

export { bookingTrackingCode }
