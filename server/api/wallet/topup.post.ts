import { randomBytes } from 'node:crypto'
import { isOnlinePaymentsEnabled } from '#shared/bookingPayment.ts'
import { normalizeWalletTopUpAmount } from '#shared/walletTopUp.ts'
import { getPaymentService } from '../../utils/payments/service'
import { supersedePendingTopUpPayments } from '../../utils/paymentSync'

/**
 * Start online wallet top-up (same SEP / test-gateway pipeline as court checkout).
 * Rejected when PAYMENTS_MODE=pay_at_club.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  if (!isOnlinePaymentsEnabled()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Wallet top-up requires online payments mode',
    })
  }

  const body = await readBody<{ amount?: number }>(event)
  const amount = normalizeWalletTopUpAmount(body?.amount)
  if (amount == null) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid top-up amount' })
  }

  await supersedePendingTopUpPayments(user.id)

  const service = getPaymentService()
  const session = await service.createIntent({
    amount,
    userId: user.id,
    purpose: 'topup',
    idempotencyKey: randomBytes(16).toString('hex'),
  })
  return session
})
