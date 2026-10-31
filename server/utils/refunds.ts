import type { Prisma } from '@prisma/client'
import type { CancelMoneyOutcome } from '#shared/cancelPolicy.ts'
import { isPaymentRefundable } from '#shared/bookingPayment.ts'
import {
  buildCancelRefundMetadata,
  parsePaymentMetadata,
  resolveRefundChannel,
  type DeskCashReturn,
  type RefundChannel,
} from '#shared/cancelRefund.ts'
import { syncPaymentToParent } from './paymentSync'
import { prisma } from './prisma'
import { clawbackOwnerForPayment } from './settlement'
import { creditWallet } from './wallet'

type DbClient = Prisma.TransactionClient | typeof prisma

export interface RefundResult {
  refunded: boolean
  walletCredited: boolean
  /**
   * Always false on cancel: product is closed-loop wallet credit.
   * SEP ReverseTransaction is not called from this path (see refundChannel).
   */
  gatewayRefunded: boolean
  amount: number
  refundChannel?: RefundChannel
  /** Set when refundChannel is desk_cash. */
  deskCashReturn?: DeskCashReturn | null
}

/**
 * Cancellation refunds are dual-rail:
 * - IPG / wallet PAID → closed-loop athlete wallet credit (no bank reverse) + owner clawback
 * - Desk CASH → no athlete credit; mark REFUNDED with deskCashReturn=owed; clawback only if a ledger row exists
 *
 * Credit + REFUNDED + clawback run together. Pass `db` to nest inside cancel's transaction
 * so the slot is never freed unless money movement succeeds.
 */
export async function refundPaymentForCancellation(options: {
  paymentId: string
  userId?: string | null
  reason: string
  bookingId?: string
  /** @deprecated Prefer moneyOutcome. */
  skipWallet?: boolean
  moneyOutcome?: CancelMoneyOutcome
  /** Nest inside an open Prisma transaction (skip outer $transaction + parent sync). */
  db?: DbClient
  /** When nested, caller syncs parents after commit. Default true when db omitted. */
  syncParent?: boolean
}): Promise<RefundResult> {
  const outcome = options.moneyOutcome
    || (options.skipWallet ? 'zero_refund' : 'full_wallet_refund')

  if (outcome === 'zero_refund') {
    return { refunded: false, walletCredited: false, gatewayRefunded: false, amount: 0 }
  }

  const db = options.db || prisma
  const payment = await db.payment.findUnique({
    where: { id: options.paymentId },
    include: { booking: { select: { paymentMethod: true } } },
  })
  if (!payment || !isPaymentRefundable(payment.status)) {
    return { refunded: false, walletCredited: false, gatewayRefunded: false, amount: 0 }
  }

  const channel = resolveRefundChannel(payment.method, payment.booking?.paymentMethod)
  // Desk cash never entered platform float — no athlete credit.
  const canCreditAthlete = Boolean(options.userId)
    && channel === 'wallet_closed_loop'
    && payment.method !== 'NOT_PAID'

  const existingMeta = parsePaymentMetadata(payment.metadataJson)
  const nextMeta = buildCancelRefundMetadata(existingMeta, {
    channel,
    reason: options.reason,
    manualRefund: channel === 'wallet_closed_loop' && !canCreditAthlete && payment.method !== 'NOT_PAID',
  })

  let walletCredited = false

  const apply = async (tx: DbClient) => {
    // Credit before marking REFUNDED — never leave the athlete without credit on a refunded row.
    if (canCreditAthlete && options.userId) {
      await creditWallet(options.userId, payment.amount, {
        paymentId: payment.id,
        bookingId: options.bookingId,
        note: options.reason,
        type: 'REFUND_CREDIT',
      }, tx)
      walletCredited = true
    }

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'REFUNDED',
        metadataJson: JSON.stringify(nextMeta),
      },
    })

    await clawbackOwnerForPayment(payment.id, tx)
  }

  if (options.db) {
    await apply(options.db)
  }
  else {
    await prisma.$transaction(async (tx) => apply(tx))
  }

  const shouldSync = options.syncParent ?? !options.db
  if (shouldSync) {
    await syncPaymentToParent(payment.id)
  }

  return {
    refunded: true,
    walletCredited,
    gatewayRefunded: false,
    amount: payment.amount,
    refundChannel: channel,
    deskCashReturn: channel === 'desk_cash' ? 'owed' : null,
  }
}
