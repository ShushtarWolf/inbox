import {
  isSeriesPaymentGroup,
  parseSeriesPaymentMeta,
  sessionRefundAmount,
  type SeriesPaymentMeta,
} from '#shared/athleteSeason.ts'
import type { CancelMoneyOutcome } from '#shared/cancelPolicy.ts'
import { refundAmountFromBps } from '#shared/cancelPolicy.ts'
import { isPaymentRefundable } from '#shared/bookingPayment.ts'
import {
  buildCancelRefundMetadata,
  ordinaryCancelRefundGuard,
  parsePaymentMetadata,
  resolveRefundChannel,
} from '#shared/cancelRefund.ts'
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

  if (remainingActive === 0) {
    // Last session — refund residual on primary (may be full amount if nothing refunded yet).
    const residual = Math.max(0, primaryPayment.amount - alreadyRefunded)
    if (residual <= 0) {
      return { refunded: false, walletCredited: false, gatewayRefunded: false, amount: 0 }
    }
    if (alreadyRefunded <= 0 && residual === primaryPayment.amount) {
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
    // Partial residual: wallet credit + pro-rata owner clawback in one txn.
    const residualScaled = opts.moneyOutcome === 'partial_wallet_refund'
      ? refundAmountFromBps(residual, opts.refundBps ?? 10_000)
      : residual
    return applySeriesSessionRefund({
      userId: opts.userId,
      paymentId: primaryPayment.id,
      method: primaryPayment.method,
      bookingPaymentMethod: primaryBookingPaymentMethod,
      bookingId: opts.cancelledBookingId,
      amount: residualScaled,
      reason: opts.reason,
      primaryMeta,
      markRefunded: true,
      db: opts.db,
    })
  }

  const amountRaw = sessionRefundAmount({
    sessionPrice,
    primaryAmount: primaryPayment.amount,
    alreadyRefunded,
    // remainingActive excludes cancelled; include it for fair-split denominator.
    remainingSessions: remainingActive + 1,
  })
  const amount = opts.moneyOutcome === 'partial_wallet_refund'
    ? refundAmountFromBps(amountRaw, opts.refundBps ?? 10_000)
    : amountRaw
  if (amount <= 0) {
    return { refunded: false, walletCredited: false, gatewayRefunded: false, amount: 0 }
  }

  return applySeriesSessionRefund({
    userId: opts.userId,
    paymentId: primaryPayment.id,
    method: primaryPayment.method,
    bookingPaymentMethod: primaryBookingPaymentMethod,
    bookingId: opts.cancelledBookingId,
    amount,
    reason: opts.reason,
    primaryMeta,
    markRefunded: false,
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
    const guard = ordinaryCancelRefundGuard(freshMeta)
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

    const already = Number(freshMeta.sessionRefundsTotal || 0)
    const capped = Math.min(opts.amount, Math.max(0, fresh.amount - already))
    if (capped <= 0) {
      return { amount: 0, walletCredited: false, gatewayRefunded: historicallyReversed, refundChannel }
    }

    let walletCredited = false
    if (canCredit && opts.userId) {
      await creditWallet(opts.userId, capped, {
        paymentId: opts.paymentId,
        bookingId: opts.bookingId,
        note: opts.reason,
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
          sessionRefundedBookingIds: [...doneIds, opts.bookingId],
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
