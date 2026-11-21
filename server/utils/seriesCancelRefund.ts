import {
  isSeriesPaymentGroup,
  parseSeriesPaymentMeta,
  type SeriesPaymentMeta,
} from '#shared/athleteSeason.ts'
import type { CancelMoneyOutcome } from '#shared/cancelPolicy.ts'
import { isPaymentRefundable } from '#shared/bookingPayment.ts'
import {
  buildCancelRefundMetadata,
  ordinaryCancelRefundGuard,
  parsePaymentMetadata,
  resolveRefundChannel,
} from '#shared/cancelRefund.ts'
import { cancelDeskCashReturnAmount, cancelWalletCreditAmount } from '#shared/owedCancelRefund.ts'
import type { Prisma } from '@prisma/client'
import { createError } from 'h3'
import type { RefundResult } from './refunds'
import { refundPaymentForCancellation } from './refunds'
import { clawbackOwnerPartialForPayment } from './settlement'
import { creditWallet } from './wallet'
import { cancelCourtBooking } from './cancellations'
import { prisma } from './prisma'

export type SeriesGroupInfo = {
  primaryBookingId: string
  siblingIds: string[]
  allBookingIds: string[]
  seasonBookingId?: string
  meta: SeriesPaymentMeta
}

/** Resolve primary + siblings from a booking's payment metadata. */
export function resolveSeriesGroupFromMeta(
  bookingId: string,
  meta: SeriesPaymentMeta,
): SeriesGroupInfo | null {
  if (!isSeriesPaymentGroup(meta)) return null
  const primaryBookingId = meta.coveredByBookingId
    || meta.groupPrimaryBookingId
    || bookingId
  const siblings = [...new Set(
    (meta.groupSiblingBookingIds || [])
      .filter((id): id is string => typeof id === 'string' && Boolean(id)),
  )]
  // If we only know coveredBy, siblings list may be empty until we load primary.
  const allBookingIds = [...new Set([primaryBookingId, ...siblings, bookingId])]
  return {
    primaryBookingId,
    siblingIds: siblings.filter((id) => id !== primaryBookingId),
    allBookingIds,
    seasonBookingId: meta.seasonBookingId,
    meta,
  }
}

type SeriesDb = Prisma.TransactionClient | typeof prisma

export async function loadSeriesGroupForBooking(bookingId: string, db: SeriesDb = prisma): Promise<{
  group: SeriesGroupInfo
  bookingPayment: { id: string; amount: number; status: string; method: string; metadataJson: string | null } | null
  primaryPayment: {
    id: string
    amount: number
    status: string
    method: string
    metadataJson: string | null
    bookingId: string | null
  }
} | null> {
  const payment = await db.payment.findUnique({ where: { bookingId } })
  const meta = parseSeriesPaymentMeta(payment?.metadataJson)
  let group = resolveSeriesGroupFromMeta(bookingId, meta)
  if (!group) return null

  const primaryPayment = await db.payment.findUnique({
    where: { bookingId: group.primaryBookingId },
  })
  if (!primaryPayment) return null

  const primaryMeta = parseSeriesPaymentMeta(primaryPayment.metadataJson)
  // Prefer primary's sibling list (authoritative).
  if (primaryMeta.groupSiblingBookingIds?.length) {
    group = {
      ...group,
      siblingIds: primaryMeta.groupSiblingBookingIds.filter((id) => id !== group!.primaryBookingId),
      allBookingIds: [...new Set([
        group.primaryBookingId,
        ...primaryMeta.groupSiblingBookingIds,
        bookingId,
      ])],
      seasonBookingId: primaryMeta.seasonBookingId || group.seasonBookingId,
      meta: { ...meta, ...primaryMeta },
    }
  }

  return {
    group,
    bookingPayment: payment
      ? {
          id: payment.id,
          amount: payment.amount,
          status: payment.status,
          method: payment.method,
          metadataJson: payment.metadataJson,
        }
      : null,
    primaryPayment: {
      id: primaryPayment.id,
      amount: primaryPayment.amount,
      status: primaryPayment.status,
      method: primaryPayment.method,
      metadataJson: primaryPayment.metadataJson,
      bookingId: primaryPayment.bookingId,
    },
  }
}

async function countActiveSeriesBookings(bookingIds: string[], excludingId?: string, db: SeriesDb = prisma) {
  return db.booking.count({
    where: {
      id: { in: bookingIds },
      status: { not: 'CANCELLED' },
      ...(excludingId ? { NOT: { id: excludingId } } : {}),
    },
  })
}

/**
 * After a series booking row is cancelled: pro-rata wallet credit while siblings remain,
 * or full residual refund when this was the last active session.
 * Returns null when the booking is not part of a paid series group (caller uses normal refund).
 */
export async function refundAfterSeriesSessionCancel(opts: {
  cancelledBookingId: string
  userId?: string | null
  reason: string
  moneyOutcome?: CancelMoneyOutcome
  refundBps?: number
  db?: Prisma.TransactionClient
}): Promise<RefundResult | null> {
  if (opts.moneyOutcome === 'zero_refund') {
    return { refunded: false, walletCredited: false, gatewayRefunded: false, amount: 0 }
  }

  // Read through the caller's transaction so several cancels in one txn see each other's writes.
  const reader: SeriesDb = opts.db || prisma
  const loaded = await loadSeriesGroupForBooking(opts.cancelledBookingId, reader)
  if (!loaded) return null

  const { group, primaryPayment } = loaded
  const primaryMeta = parseSeriesPaymentMeta(primaryPayment.metadataJson)
  const cancelledMeta = parseSeriesPaymentMeta(loaded.bookingPayment?.metadataJson)
  const sessionPrice = cancelledMeta.sessionPrice ?? primaryMeta.sessionPrice
  const alreadyRefunded = Number(primaryMeta.sessionRefundsTotal || 0)
  const primaryBooking = primaryPayment.bookingId
    ? await reader.booking.findUnique({
        where: { id: primaryPayment.bookingId },
        select: { paymentMethod: true },
      })
    : null
  const primaryBookingPaymentMethod = primaryBooking?.paymentMethod ?? null

  if (!isPaymentRefundable(primaryPayment.status)) {
    return { refunded: false, walletCredited: false, gatewayRefunded: false, amount: 0 }
  }

  const remainingActive = await countActiveSeriesBookings(group.allBookingIds, opts.cancelledBookingId, reader)
  // remainingActive excludes the cancelled row; include it for fair-split / last-session residual.
  const remainingIncludingCancelled = remainingActive + 1
  const refundBps = opts.moneyOutcome === 'partial_wallet_refund'
    ? Math.max(0, Math.min(10_000, Math.floor(Number(opts.refundBps) || 0)))
    : 10_000
  const liveMeta = { ...parsePaymentMetadata(primaryPayment.metadataJson) }
  delete liveMeta.refundCreditAmount
  delete liveMeta.refundedAmount
  const owedInput = {
    method: primaryPayment.method,
    bookingPaymentMethod: primaryBookingPaymentMethod,
    paymentAmount: primaryPayment.amount,
    primaryAmount: primaryPayment.amount,
    sessionPrice,
    alreadyRefundedOnPrimary: alreadyRefunded,
    remainingSessionsIncludingCancelled: remainingIncludingCancelled,
    treatAsSeries: true as const,
    refundBps,
    metadata: liveMeta,
  }
  // Wallet credit stays 0 for desk cash; still report session share for cashReturnTotal / desk ack.
  const amount = cancelWalletCreditAmount(owedInput).amount
    || cancelDeskCashReturnAmount(owedInput).amount

  if (amount <= 0) {
    return { refunded: false, walletCredited: false, gatewayRefunded: false, amount: 0 }
  }

  // Last session with nothing yet refunded and full primary owed → ordinary full refund path
  // (marks REFUNDED + full clawback) instead of a session partial.
  if (
    remainingActive === 0
    && alreadyRefunded <= 0
    && amount === primaryPayment.amount
  ) {
    return refundPaymentForCancellation({
      paymentId: primaryPayment.id,
      userId: opts.userId,
      bookingId: opts.cancelledBookingId,
      reason: opts.reason,
      moneyOutcome: opts.moneyOutcome,
      refundBps: opts.refundBps,
      db: opts.db,
      syncParent: !opts.db,
    })
  }

  const settleResidual = remainingActive === 0 && alreadyRefunded > 0

  return applySeriesSessionRefund({
    userId: opts.userId,
    paymentId: primaryPayment.id,
    method: primaryPayment.method,
    bookingPaymentMethod: primaryBookingPaymentMethod,
    bookingId: opts.cancelledBookingId,
    amount,
    reason: opts.reason,
    primaryMeta,
    markRefunded: remainingActive === 0,
    settleResidual,
    db: opts.db,
  })
}

/** Credit (non-cash) + clawback + metadata update — fail closed if clawback throws. */
async function applySeriesSessionRefund(opts: {
  userId?: string | null
  paymentId: string
  method: string
  bookingPaymentMethod?: string | null
  bookingId: string
  amount: number
  reason: string
  primaryMeta: SeriesPaymentMeta
  markRefunded: boolean
  settleResidual?: boolean
  db?: Prisma.TransactionClient
}): Promise<RefundResult> {
  const channel = resolveRefundChannel(opts.method, opts.bookingPaymentMethod)

  const run = async (tx: Prisma.TransactionClient) => {
    // Row lock serializes session cancels on one series payment; totals below are read fresh.
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${opts.paymentId} FOR UPDATE`
    const fresh = await tx.payment.findUniqueOrThrow({ where: { id: opts.paymentId } })
    if (!isPaymentRefundable(fresh.status)) {
      return { amount: 0, walletCredited: false, gatewayRefunded: false, refundChannel: channel }
    }
    const freshMeta = { ...opts.primaryMeta, ...parsePaymentMetadata(fresh.metadataJson) }
    const guard = ordinaryCancelRefundGuard(freshMeta, { method: fresh.method })
    if (guard.action === 'reverse_pending' && channel !== 'desk_cash') {
      throw createError({
        statusCode: 409,
        statusMessage: 'SEP_REVERSE_PENDING',
        data: { paymentId: opts.paymentId, reversePending: true },
      })
    }
    const historicallyReversed = guard.action === 'already_reversed'
    const refundChannel = historicallyReversed ? 'gateway_reverse' as const : channel
    const canCredit = Boolean(opts.userId) && refundChannel === 'wallet_closed_loop'
    const doneIds = Array.isArray(freshMeta.sessionRefundedBookingIds) ? freshMeta.sessionRefundedBookingIds : []
    const already = Number(freshMeta.sessionRefundsTotal || 0)
    const refundCreditLive = await tx.walletTransaction.aggregate({
      where: { paymentId: opts.paymentId, type: 'REFUND_CREDIT' },
      _sum: { amount: true },
    })
    const totalRefundCredit = Math.max(0, refundCreditLive._sum.amount || 0)
    const capped = Math.min(opts.amount, Math.max(0, fresh.amount - totalRefundCredit))
    if (capped <= 0) {
      return { amount: 0, walletCredited: false, gatewayRefunded: historicallyReversed, refundChannel }
    }

    const residualSweep = Boolean(opts.settleResidual && opts.markRefunded && already > 0)
    if (residualSweep) {
      const priorResidual = await tx.walletTransaction.findFirst({
        where: {
          paymentId: opts.paymentId,
          type: 'REFUND_CREDIT',
          note: { contains: 'series-primary-residual' },
        },
        select: { id: true },
      })
      if (priorResidual) {
        return { amount: 0, walletCredited: false, gatewayRefunded: historicallyReversed, refundChannel }
      }
    }
    else {
      const [priorUserTx, priorClubTx] = await Promise.all([
        tx.walletTransaction.findFirst({
          where: {
            paymentId: opts.paymentId,
            bookingId: opts.bookingId,
            type: { in: ['REFUND_CREDIT', 'SETTLEMENT_CLAWBACK'] },
          },
          select: { id: true },
        }),
        tx.clubWalletTransaction.findFirst({
          where: { paymentId: opts.paymentId, bookingId: opts.bookingId, type: 'CLAWBACK' },
          select: { id: true },
        }),
      ])
      // Retry of an already-refunded session (athlete re-tap, owner re-run) moves no money.
      if (doneIds.includes(opts.bookingId) || priorUserTx || priorClubTx) {
        return { amount: 0, walletCredited: false, gatewayRefunded: historicallyReversed, refundChannel }
      }
    }

    let walletCredited = false
    const refundNote = residualSweep
      ? `series-primary-residual:${opts.paymentId}`
      : opts.reason
    if (canCredit && opts.userId) {
      await creditWallet(opts.userId, capped, {
        paymentId: opts.paymentId,
        bookingId: opts.bookingId,
        note: refundNote,
        type: 'REFUND_CREDIT',
      }, tx)
      walletCredited = true
    }
    await clawbackOwnerPartialForPayment({
      paymentId: opts.paymentId,
      grossRefundAmount: capped,
      bookingId: opts.bookingId,
      db: tx,
    })
    const nextDoneIds = residualSweep && doneIds.includes(opts.bookingId)
      ? doneIds
      : [...doneIds, opts.bookingId]
    await tx.payment.update({
      where: { id: opts.paymentId },
      data: {
        ...(opts.markRefunded ? { status: 'REFUNDED' as const } : {}),
        metadataJson: JSON.stringify({
          ...buildCancelRefundMetadata(freshMeta, {
            channel: refundChannel,
            reason: opts.reason,
            manualRefund: refundChannel === 'wallet_closed_loop' && !canCredit,
          }),
          sessionRefundsTotal: already + capped,
          sessionRefundedBookingIds: nextDoneIds,
          ...(residualSweep ? { seriesResidualSettledAt: new Date().toISOString() } : {}),
        }),
      },
    })
    return { amount: capped, walletCredited, gatewayRefunded: historicallyReversed, refundChannel }
  }
  const applied = opts.db ? await run(opts.db) : await prisma.$transaction(run)

  if (applied.amount <= 0) {
    return {
      refunded: false,
      walletCredited: false,
      gatewayRefunded: applied.gatewayRefunded,
      amount: 0,
      refundChannel: applied.refundChannel,
    }
  }
  return {
    refunded: true,
    walletCredited: applied.walletCredited,
    gatewayRefunded: applied.gatewayRefunded,
    amount: applied.amount,
    refundChannel: applied.refundChannel,
    deskCashReturn: applied.refundChannel === 'desk_cash' ? 'owed' : null,
  }
}

/** Unpaid primary cancel: also free unpaid siblings in the same series group. */
export async function cancelUnpaidSeriesSiblings(opts: {
  primaryBookingId: string
  actorUserId?: string
  reason: string
  userId?: string | null
}): Promise<string[]> {
  const loaded = await loadSeriesGroupForBooking(opts.primaryBookingId)
  if (!loaded) return []

  const { group, primaryPayment } = loaded
  if (isPaymentRefundable(primaryPayment.status)) return []

  const siblings = await prisma.booking.findMany({
    where: {
      id: { in: group.siblingIds },
      status: { not: 'CANCELLED' },
    },
    select: { id: true, slotId: true, payment: { select: { id: true, status: true } } },
  })

  const cancelled: string[] = []
  for (const sibling of siblings) {
    if (sibling.payment && isPaymentRefundable(sibling.payment.status)) continue
    await cancelCourtBooking({
      bookingId: sibling.id,
      slotId: sibling.slotId,
      actorUserId: opts.actorUserId,
      reason: opts.reason,
      paymentId: null,
      userId: opts.userId,
      skipLinkedCoachSession: true,
    })
    cancelled.push(sibling.id)
  }
  return cancelled
}

/**
 * Refund the series share and free this slot in one transaction.
 * A failure rolls both back, so the court is not left free without the wallet credit.
 */
export async function cancelSeriesSessionWithSlot(opts: {
  bookingId: string
  slotId: string
  actorUserId?: string
  userId?: string | null
  reason: string
  moneyOutcome?: CancelMoneyOutcome
  refundBps?: number
}) {
  const { cancelCourtBooking } = await import('./cancellations')
  let refund: RefundResult | null = null
  await prisma.$transaction(async (tx) => {
    refund = await refundAfterSeriesSessionCancel({
      cancelledBookingId: opts.bookingId,
      userId: opts.userId,
      reason: opts.reason,
      moneyOutcome: opts.moneyOutcome,
      refundBps: opts.refundBps,
      db: tx,
    })
    await cancelCourtBooking({
      bookingId: opts.bookingId,
      slotId: opts.slotId,
      actorUserId: opts.actorUserId,
      reason: opts.reason,
      paymentId: null,
      userId: opts.userId,
      moneyOutcome: 'zero_refund',
      db: tx,
    })
  })
  try {
    const loaded = await loadSeriesGroupForBooking(opts.bookingId)
    if (loaded) {
      const { syncPaymentToParent } = await import('./paymentSync')
      await syncPaymentToParent(loaded.primaryPayment.id)
    }
  }
  catch (err) {
    console.error('[cancelSeriesSessionWithSlot:sync]', opts.bookingId, err)
  }
  return refund
}

/** True when payment metadata indicates a multi-session pay group (season or basket). */
export function bookingLooksLikeSeriesPayment(metadataJson?: string | null): boolean {
  return isSeriesPaymentGroup(parseSeriesPaymentMeta(metadataJson))
}
