import type { Prisma } from '@prisma/client'
import { createError } from 'h3'
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
import {
  canAttemptSepReverse,
  isSepReverseAlreadyDoneError,
  isSepReverseAmbiguousError,
} from '#shared/sepReverseWindow.ts'
import { readSplitPayMeta } from '#shared/splitPay.ts'
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
  /** Ambiguous SEP reverse left pending — cancel must not free the slot / wallet-fallback. */
  reversePending?: boolean
}

async function persistPaymentMeta(paymentId: string, meta: Record<string, unknown>) {
  // Always use root prisma so reversePending survives a rolled-back cancel txn.
  await prisma.payment.update({
    where: { id: paymentId },
    data: { metadataJson: JSON.stringify(meta) },
  })
}

/**
 * Cancellation refunds are dual-rail:
 * - IPG within 25m of confirm (live SEP) → gateway reverse when possible; else wallet credit + clawback
 * - IPG / wallet PAID → closed-loop athlete wallet credit + owner clawback
 * - Desk CASH → no athlete credit; mark REFUNDED with deskCashReturn=owed; clawback only if a ledger row exists
 *
 * Credit + REFUNDED + clawback run together. Pass `db` to nest inside cancel's transaction
 * so the slot is never freed unless money movement succeeds. Gateway reverse is attempted
 * before the DB transaction (external API). Ambiguous reverse (timeout) → reversePending,
 * no wallet credit (avoids double refund if SEP actually succeeded).
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
  let existingMeta = parsePaymentMetadata(payment.metadataJson)

  let gatewayRefunded = existingMeta.gatewayReversed === true
  const reverseAttempt = canAttemptSepReverse({
    method: payment.method,
    provider: payment.provider,
    paymentsMode: getPaymentsMode(),
    metadata: existingMeta,
  })

  // SEP reverses the whole charge — partial refunds must go closed-loop wallet instead.
  if (!gatewayRefunded && channel === 'wallet_closed_loop' && reverseAttempt.ok && refundBps >= 10_000) {
    const terminalId = process.env.SEP_TERMINAL_ID || process.env.NUXT_SEP_TERMINAL_ID || ''
    if (terminalId) {
      existingMeta = {
        ...existingMeta,
        reversePending: true,
        reversePendingAt: new Date().toISOString(),
      }
      await persistPaymentMeta(payment.id, existingMeta)

      try {
        await sepReverseTransaction({ terminalId, refNum: reverseAttempt.refNum })
        gatewayRefunded = true
        channel = 'gateway_reverse'
        existingMeta = {
          ...existingMeta,
          reversePending: false,
          gatewayReversed: true,
          gatewayRefund: true,
          reverseResolvedAt: new Date().toISOString(),
        }
        await persistPaymentMeta(payment.id, existingMeta)
      }
      catch (err) {
        if (isSepReverseAlreadyDoneError(err)) {
          gatewayRefunded = true
          channel = 'gateway_reverse'
          existingMeta = {
            ...existingMeta,
            reversePending: false,
            gatewayReversed: true,
            gatewayRefund: true,
            reverseResolvedAt: new Date().toISOString(),
          }
          await persistPaymentMeta(payment.id, existingMeta)
        }
        else if (isSepReverseAmbiguousError(err)) {
          console.warn('[refunds] SEP reverse ambiguous; leaving reversePending', payment.id, err)
          throw createError({
            statusCode: 409,
            statusMessage: 'SEP_REVERSE_PENDING',
            data: { paymentId: payment.id, reversePending: true },
          })
        }
        else {
          console.warn('[refunds] SEP reverse failed; falling back to wallet', payment.id, err)
          existingMeta = {
            ...existingMeta,
            reversePending: false,
            reverseFailedAt: new Date().toISOString(),
            reverseFailReason: err instanceof Error ? err.message : String(err),
          }
          await persistPaymentMeta(payment.id, existingMeta)
        }
      }
    }
  }
  else if (gatewayRefunded) {
    channel = 'gateway_reverse'
  }

  // Prefer explicit cancel userId, then payment payer, then booking.userId.
  // Do NOT credit via guestMobile phone match — shared/wrong numbers hit the wrong wallet;
  // guest IPG without a linked user stays manualBankRefund (ops ack).
  let creditUserId = options.userId || payment.userId || payment.booking?.userId || null
  if (!creditUserId && !gatewayRefunded && bookingId) {
    const booking = await db.booking.findUnique({
      where: { id: bookingId },
      select: { userId: true },
    })
    creditUserId = booking?.userId || null
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
    nextMeta.reversePending = false
  }

  let walletCredited = false
  const creditAmount = gatewayRefunded
    ? reverseWalletRestock
    : refundAmountFromBps(payment.amount, refundBps)
  nextMeta.refundBps = refundBps
  nextMeta.refundCreditAmount = creditAmount
  nextMeta.refundedAmount = creditAmount
  // Always REFUNDED (terminal). Partial shares live in refundBps / refundedAmount —
  // a PARTIALLY_REFUNDED status was skipped by finance/wallet filters and SEP protectors.

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

    // A card reverse already returned the full charge, whatever refundBps says.
    if (refundBps >= 10_000 || gatewayRefunded) {
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

/**
 * Retry SEP reverse for payments stuck in reversePending after timeout.
 * Idempotent: success or already-reversed clears pending; definitive fail clears for wallet cancel retry.
 */
export async function resolvePendingSepReverse(paymentId: string): Promise<{
  resolved: boolean
  gatewayReversed: boolean
  reason: string
}> {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } })
  if (!payment) return { resolved: false, gatewayReversed: false, reason: 'not_found' }
  if (payment.status !== 'PAID') return { resolved: false, gatewayReversed: false, reason: 'not_paid' }

  const meta = parsePaymentMetadata(payment.metadataJson)
  if (meta.gatewayReversed === true) {
    return { resolved: true, gatewayReversed: true, reason: 'already_reversed' }
  }
  if (meta.reversePending !== true) {
    return { resolved: false, gatewayReversed: false, reason: 'not_pending' }
  }

  const terminalId = process.env.SEP_TERMINAL_ID || process.env.NUXT_SEP_TERMINAL_ID || ''
  const refNum = meta.refNum != null ? String(meta.refNum) : ''
  if (!terminalId || !refNum) {
    return { resolved: false, gatewayReversed: false, reason: 'missing_terminal_or_ref' }
  }

  try {
    await sepReverseTransaction({ terminalId, refNum })
    await persistPaymentMeta(paymentId, {
      ...meta,
      reversePending: false,
      gatewayReversed: true,
      gatewayRefund: true,
      reverseResolvedAt: new Date().toISOString(),
    })
    return { resolved: true, gatewayReversed: true, reason: 'reversed' }
  }
  catch (err) {
    if (isSepReverseAlreadyDoneError(err)) {
      await persistPaymentMeta(paymentId, {
        ...meta,
        reversePending: false,
        gatewayReversed: true,
        gatewayRefund: true,
        reverseResolvedAt: new Date().toISOString(),
      })
      return { resolved: true, gatewayReversed: true, reason: 'already_reversed' }
    }
    if (isSepReverseAmbiguousError(err)) {
      return { resolved: false, gatewayReversed: false, reason: 'still_ambiguous' }
    }
    await persistPaymentMeta(paymentId, {
      ...meta,
      reversePending: false,
      reverseFailedAt: new Date().toISOString(),
      reverseFailReason: err instanceof Error ? err.message : String(err),
    })
    return { resolved: true, gatewayReversed: false, reason: 'definitive_fail' }
  }
}
