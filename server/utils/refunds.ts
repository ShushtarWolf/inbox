import type { Prisma } from '@prisma/client'
import type { CancelMoneyOutcome } from '#shared/cancelPolicy.ts'
import { refundAmountFromBps } from '#shared/cancelPolicy.ts'
import { isPaymentRefundable } from '#shared/bookingPayment.ts'
import {
  buildCancelRefundMetadata,
  parsePaymentMetadata,
  resolveRefundChannel,
  type DeskCashReturn,
  type RefundChannel,
} from '#shared/cancelRefund.ts'
import { getPaymentsMode } from '#shared/payments.ts'
import { canAttemptSepReverse } from '#shared/sepReverseWindow.ts'
import { readSplitPayMeta } from '#shared/splitPay.ts'
import { findUserIdByPhone } from './phoneAuth'
import { sepReverseTransaction } from './payments/sepClient'
import { syncPaymentToParent } from './paymentSync'
import { prisma } from './prisma'
import { clawbackOwnerForPayment, clawbackOwnerPartialForPayment } from './settlement'
import { creditWallet } from './wallet'

type DbClient = Prisma.TransactionClient | typeof prisma

export interface RefundResult {
  refunded: boolean
  walletCredited: boolean
  /** True when SEP ReverseTransaction succeeded within the reverse window. */
  gatewayRefunded: boolean
  amount: number
  refundChannel?: RefundChannel
  /** Set when refundChannel is desk_cash. */
  deskCashReturn?: DeskCashReturn | null
}

/**
 * Cancellation refunds are dual-rail:
 * - IPG within 25m of confirm (live SEP) → gateway reverse when possible; else wallet credit + clawback
 * - IPG / wallet PAID → closed-loop athlete wallet credit + owner clawback
 * - Desk CASH → no athlete credit; mark REFUNDED with deskCashReturn=owed; clawback only if a ledger row exists
 *
 * Credit + REFUNDED + clawback run together. Pass `db` to nest inside cancel's transaction
 * so the slot is never freed unless money movement succeeds. Gateway reverse is attempted
 * before the DB transaction (external API).
 */
export async function refundPaymentForCancellation(options: {
  paymentId: string
  userId?: string | null
  reason: string
  bookingId?: string
  /** @deprecated Prefer moneyOutcome. */
  skipWallet?: boolean
  moneyOutcome?: CancelMoneyOutcome
  /** When partial_wallet_refund — credit/clawback this share (0–10000). */
  refundBps?: number
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
  const refundBps = outcome === 'partial_wallet_refund'
    ? Math.max(0, Math.min(10_000, Math.floor(Number(options.refundBps) || 0)))
    : 10_000
  if (outcome === 'partial_wallet_refund' && refundBps <= 0) {
    return { refunded: false, walletCredited: false, gatewayRefunded: false, amount: 0 }
  }

  const db = options.db || prisma
  const payment = await db.payment.findUnique({
    where: { id: options.paymentId },
    include: {
      booking: { select: { paymentMethod: true, userId: true, guestMobile: true } },
    },
  })
  if (!payment || !isPaymentRefundable(payment.status)) {
    return { refunded: false, walletCredited: false, gatewayRefunded: false, amount: 0 }
  }

  let channel = resolveRefundChannel(payment.method, payment.booking?.paymentMethod)
  const bookingId = options.bookingId || payment.bookingId || undefined
  const existingMeta = parsePaymentMetadata(payment.metadataJson)

  let gatewayRefunded = false
  const reverseAttempt = canAttemptSepReverse({
    method: payment.method,
    provider: payment.provider,
    paymentsMode: getPaymentsMode(),
    metadata: existingMeta,
  })
  if (channel === 'wallet_closed_loop' && reverseAttempt.ok) {
    const terminalId = process.env.SEP_TERMINAL_ID || process.env.NUXT_SEP_TERMINAL_ID || ''
    if (terminalId) {
      try {
        await sepReverseTransaction({ terminalId, refNum: reverseAttempt.refNum })
        gatewayRefunded = true
        channel = 'gateway_reverse'
      }
      catch (err) {
        console.warn('[refunds] SEP reverse failed; falling back to wallet', payment.id, err)
      }
    }
  }

  // Prefer explicit cancel userId, then payment payer, then booking owner, then guest phone match.
  let creditUserId = options.userId || payment.userId || payment.booking?.userId || null
  if (!creditUserId && !gatewayRefunded) {
    const guestMobile = payment.booking?.guestMobile
    if (guestMobile) {
      creditUserId = await findUserIdByPhone(guestMobile)
    }
    else if (bookingId) {
      const booking = await db.booking.findUnique({
        where: { id: bookingId },
        select: { userId: true, guestMobile: true },
      })
      creditUserId = booking?.userId || null
      if (!creditUserId && booking?.guestMobile) {
        creditUserId = await findUserIdByPhone(booking.guestMobile)
      }
    }
  }

  const split = readSplitPayMeta(existingMeta)
  // Desk cash / pure gateway reverse: no wallet. Split+reverse still restores wallet rail.
  const reverseWalletRestock = gatewayRefunded && split
    ? refundAmountFromBps(split.walletDebitAmount, refundBps)
    : 0
  const canCreditAthlete = Boolean(creditUserId)
    && payment.method !== 'NOT_PAID'
    && (
      (channel === 'wallet_closed_loop' && !gatewayRefunded)
      || reverseWalletRestock > 0
    )

  const nextMeta = buildCancelRefundMetadata(existingMeta, {
    channel,
    reason: options.reason,
    manualRefund: channel === 'wallet_closed_loop' && !canCreditAthlete && payment.method !== 'NOT_PAID',
  })
  if (gatewayRefunded) {
    nextMeta.gatewayReversed = true
    nextMeta.gatewayRefund = true
  }

  let walletCredited = false
  const creditAmount = gatewayRefunded
    ? reverseWalletRestock
    : refundAmountFromBps(payment.amount, refundBps)
  nextMeta.refundBps = refundBps
  nextMeta.refundCreditAmount = creditAmount

  const apply = async (tx: DbClient) => {
    // Credit before marking REFUNDED — never leave the athlete without credit on a refunded row.
    if (canCreditAthlete && creditUserId && creditAmount > 0) {
      await creditWallet(creditUserId, creditAmount, {
        paymentId: payment.id,
        bookingId,
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

    if (refundBps >= 10_000) {
      await clawbackOwnerForPayment(payment.id, tx)
    }
    else if (creditAmount > 0) {
      await clawbackOwnerPartialForPayment({
        paymentId: payment.id,
        grossRefundAmount: creditAmount,
        bookingId: bookingId || payment.bookingId || payment.id,
        db: tx,
      })
    }
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
    gatewayRefunded,
    amount: creditAmount,
    refundChannel: channel,
    deskCashReturn: channel === 'desk_cash' ? 'owed' : null,
  }
}
