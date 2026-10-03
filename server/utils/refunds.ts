import type { CancelMoneyOutcome } from '#shared/cancelPolicy.ts'
import { isPaymentRefundable } from '#shared/bookingPayment.ts'
import { syncPaymentToParent } from './paymentSync'
import { prisma } from './prisma'
import { clawbackOwnerForPayment } from './settlement'
import { creditWallet } from './wallet'

export interface RefundResult {
  refunded: boolean
  walletCredited: boolean
  /** True when the IPG reverse/refund call succeeded (or simulated). */
  gatewayRefunded: boolean
  amount: number
}

/**
 * Cancellation refunds are closed-loop wallet credits (not bank reverses).
 * Desk CASH never credits the athlete; settlement clawback still runs if a ledger row exists.
 */
export async function refundPaymentForCancellation(options: {
  paymentId: string
  userId?: string | null
  reason: string
  bookingId?: string
  /** @deprecated Prefer moneyOutcome. */
  skipWallet?: boolean
  moneyOutcome?: CancelMoneyOutcome
}): Promise<RefundResult> {
  const outcome = options.moneyOutcome
    || (options.skipWallet ? 'zero_refund' : 'full_wallet_refund')

  if (outcome === 'zero_refund') {
    return { refunded: false, walletCredited: false, gatewayRefunded: false, amount: 0 }
  }

  const payment = await prisma.payment.findUnique({ where: { id: options.paymentId } })
  if (!payment || !isPaymentRefundable(payment.status)) {
    return { refunded: false, walletCredited: false, gatewayRefunded: false, amount: 0 }
  }

  let walletCredited = false
  const gatewayRefunded = false

  // Desk cash never entered platform float — no athlete credit.
  const canCreditAthlete = Boolean(options.userId)
    && payment.method !== 'CASH'
    && payment.method !== 'NOT_PAID'

  if (canCreditAthlete && options.userId) {
    try {
      await creditWallet(options.userId, payment.amount, {
        paymentId: payment.id,
        bookingId: options.bookingId,
        note: options.reason,
      })
      walletCredited = true
    }
    catch (err) {
      console.error('[refunds:creditWallet]', payment.id, err)
    }
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: 'REFUNDED' },
  })
  await syncPaymentToParent(payment.id)

  try {
    await clawbackOwnerForPayment(payment.id)
  }
  catch (err) {
    console.error('[refunds:ownerClawback]', payment.id, err)
  }

  return { refunded: true, walletCredited, gatewayRefunded, amount: payment.amount }
}
