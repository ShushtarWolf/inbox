import { timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import { getPaymentsMode } from '#shared/payments.ts'

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
 * Second factor for admin mark-paid on withdraw requests.
 * Live: ADMIN_PAYOUT_CONFIRM must be set; require header `x-admin-payout-confirm`.
 * Non-live: soft dual-control via body.confirmPayout === true (or header when env set).
 */
export function requireAdminPayoutConfirm(
  event: H3Event,
  body?: { confirmPayout?: boolean },
) {
  const expected = process.env.ADMIN_PAYOUT_CONFIRM?.trim()
  const live = getPaymentsMode() === 'live'

  if (live && !expected) {
    throw createError({
      statusCode: 503,
      statusMessage: 'ADMIN_PAYOUT_CONFIRM required when PAYMENTS_MODE=live',
    })
  }

  if (expected) {
    const provided = getHeader(event, 'x-admin-payout-confirm')
    if (!provided || !secretsEqual(provided, expected)) {
      throw createError({ statusCode: 403, statusMessage: 'PAYOUT_CONFIRM_REQUIRED' })
    }
    return
  }

  if (body?.confirmPayout !== true) {
    throw createError({
      statusCode: 400,
      statusMessage: 'confirmPayout required (or set ADMIN_PAYOUT_CONFIRM)',
    })
  }
}
