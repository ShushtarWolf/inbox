/**
 * /payments/test-gateway simulates SEP OK/NOK. It must only be reachable when
 * PAYMENTS_MODE=test (staging/dev without a terminal). In live or pay_at_club it 404s
 * server-side, so guests can never land on a fake "pay" screen in production.
 */
import { getPaymentsMode } from '#shared/payments.ts'

export default defineEventHandler((event) => {
  const path = (event.path || '').split('?')[0] || ''
  if (!/^(\/en)?\/payments\/test-gateway\/?$/.test(path)) return
  if (getPaymentsMode() === 'test') return
  throw createError({ statusCode: 404, statusMessage: 'Not Found' })
})
