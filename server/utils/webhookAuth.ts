import { timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'

function secretsEqual(provided: string, expected: string) {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) {
    timingSafeEqual(b, b)
    return false
  }
  return timingSafeEqual(a, b)
}

/**
 * Shared-secret gate for optional payment provider webhooks.
 * Browser SEP callback remains the primary confirmation path.
 * When PAYMENT_WEBHOOK_SECRET is unset, webhooks are disabled (501).
 */
export function requirePaymentWebhookSecret(event: H3Event) {
  const expected = process.env.PAYMENT_WEBHOOK_SECRET?.trim()
  if (!expected || expected.length < 16) {
    throw createError({
      statusCode: 501,
      statusMessage: 'Payment webhooks are not configured',
    })
  }

  const header =
    getHeader(event, 'x-webhook-secret')
    || getHeader(event, 'x-payment-webhook-secret')
    || ''
  const bearer = getHeader(event, 'authorization')?.replace(/^Bearer\s+/i, '').trim() || ''
  const provided = header || bearer

  if (!provided || !secretsEqual(provided, expected)) {
    throw createError({ statusCode: 403, statusMessage: 'Invalid webhook signature' })
  }
}
