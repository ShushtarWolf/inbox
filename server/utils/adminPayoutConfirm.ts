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
 * Second factor for admin mark-paid on withdraw requests.
 * When ADMIN_PAYOUT_CONFIRM is set, require header `x-admin-payout-confirm`.
 * When unset, require body.confirmPayout === true (soft dual-control).
 */
export function requireAdminPayoutConfirm(
  event: H3Event,
  body?: { confirmPayout?: boolean },
) {
  const expected = process.env.ADMIN_PAYOUT_CONFIRM?.trim()
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
