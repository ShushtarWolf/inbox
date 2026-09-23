import {
  isSeriesPaymentGroup,
  parseSeriesPaymentMeta,
  sessionRefundAmount,
  type SeriesPaymentMeta,
} from '#shared/athleteSeason.ts'
import { isPaymentRefundable } from '#shared/bookingPayment.ts'
import type { RefundResult } from './refunds'
import { refundPaymentForCancellation } from './refunds'
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

export async function loadSeriesGroupForBooking(bookingId: string): Promise<{
  group: SeriesGroupInfo
  bookingPayment: { id: string; amount: number; status: string; metadataJson: string | null } | null
  primaryPayment: { id: string; amount: number; status: string; metadataJson: string | null; bookingId: string | null }
} | null> {
  const payment = await prisma.payment.findUnique({ where: { bookingId } })
  const meta = parseSeriesPaymentMeta(payment?.metadataJson)
  let group = resolveSeriesGroupFromMeta(bookingId, meta)
  if (!group) return null

  const primaryPayment = await prisma.payment.findUnique({
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
          metadataJson: payment.metadataJson,
        }
      : null,
    primaryPayment: {
      id: primaryPayment.id,
      amount: primaryPayment.amount,
      status: primaryPayment.status,
      metadataJson: primaryPayment.metadataJson,
      bookingId: primaryPayment.bookingId,
    },
  }
}

async function countActiveSeriesBookings(bookingIds: string[], excludingId?: string) {
  return prisma.booking.count({
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
}): Promise<RefundResult | null> {
  const loaded = await loadSeriesGroupForBooking(opts.cancelledBookingId)
  if (!loaded) return null

  const { group, primaryPayment } = loaded
  const primaryMeta = parseSeriesPaymentMeta(primaryPayment.metadataJson)
  const cancelledMeta = parseSeriesPaymentMeta(loaded.bookingPayment?.metadataJson)
  const sessionPrice = cancelledMeta.sessionPrice ?? primaryMeta.sessionPrice
  const alreadyRefunded = Number(primaryMeta.sessionRefundsTotal || 0)

  if (!isPaymentRefundable(primaryPayment.status)) {
    return { refunded: false, walletCredited: false, gatewayRefunded: false, amount: 0 }
  }

  const remainingActive = await countActiveSeriesBookings(group.allBookingIds, opts.cancelledBookingId)

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
      })
    }
    // Partial residual: wallet credit only (gateway already settled full charge).
    if (opts.userId) {
      await creditWallet(opts.userId, residual, {
        paymentId: primaryPayment.id,
        bookingId: opts.cancelledBookingId,
        note: opts.reason,
      })
    }
    await prisma.payment.update({
      where: { id: primaryPayment.id },
      data: {
        status: 'REFUNDED',
        metadataJson: JSON.stringify({
          ...primaryMeta,
          sessionRefundsTotal: alreadyRefunded + residual,
        }),
      },
    })
    return { refunded: true, walletCredited: Boolean(opts.userId), gatewayRefunded: false, amount: residual }
  }

  const amount = sessionRefundAmount({
    sessionPrice,
    primaryAmount: primaryPayment.amount,
    alreadyRefunded,
  })
  if (amount <= 0) {
    return { refunded: false, walletCredited: false, gatewayRefunded: false, amount: 0 }
  }

  if (opts.userId) {
    await creditWallet(opts.userId, amount, {
      paymentId: primaryPayment.id,
      bookingId: opts.cancelledBookingId,
      note: opts.reason,
    })
  }

  await prisma.payment.update({
    where: { id: primaryPayment.id },
    data: {
      metadataJson: JSON.stringify({
        ...primaryMeta,
        sessionRefundsTotal: alreadyRefunded + amount,
      }),
    },
  })

  return { refunded: true, walletCredited: Boolean(opts.userId), gatewayRefunded: false, amount }
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

/** True when payment metadata indicates a multi-session pay group (season or basket). */
export function bookingLooksLikeSeriesPayment(metadataJson?: string | null): boolean {
  return isSeriesPaymentGroup(parseSeriesPaymentMeta(metadataJson))
}
