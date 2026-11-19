import { isSlotStartInPast } from '#shared/localDate.ts'
import { ownerSeriesKey, seasonBookingIdNeedle, seriesCancelPaymentId } from '#shared/ownerSeries.ts'
import type { CancelMoneyOutcome } from '#shared/cancelPolicy.ts'
import { cancelCourtBooking } from './cancellations'
import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import {
  bookingLooksLikeSeriesPayment,
  cancelSeriesSessionWithSlot,
  refundAfterSeriesSessionCancel,
} from './seriesCancelRefund'
import { isPaymentRefundable } from '#shared/bookingPayment.ts'

const seriesBookingInclude = {
  payment: true,
  user: true,
  slot: { include: { court: true } },
} as const

/** Active court bookings in this club that belong to the same season or class package. */
export async function loadOwnerSeriesBookings(clubId: string, bookingId: string) {
  const anchor = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      status: { not: 'CANCELLED' },
      slot: { court: { clubId } },
    },
    include: {
      payment: { select: { metadataJson: true } },
      events: { where: { type: 'CREATED' }, select: { metadataJson: true }, take: 4 },
    },
  })
  if (!anchor) return []

  const key = ownerSeriesKey({
    packageDraftId: anchor.packageDraftId,
    paymentMetadataJson: anchor.payment?.metadataJson,
    eventMetadataJson: anchor.events.map((event) => event.metadataJson),
  })
  if (!key) return []

  if (key.kind === 'package') {
    return prisma.booking.findMany({
      where: {
        packageDraftId: key.id,
        status: { not: 'CANCELLED' },
        slot: { court: { clubId } },
      },
      include: seriesBookingInclude,
      orderBy: [{ slot: { date: 'asc' } }, { slot: { startTime: 'asc' } }],
    })
  }

  const needle = seasonBookingIdNeedle(key.id)
  const [fromEvents, fromPayments] = await Promise.all([
    prisma.reservationEvent.findMany({
      where: {
        type: 'CREATED',
        metadataJson: { contains: needle },
        booking: { status: { not: 'CANCELLED' }, slot: { court: { clubId } } },
      },
      select: { bookingId: true },
    }),
    prisma.payment.findMany({
      where: {
        metadataJson: { contains: needle },
        booking: { status: { not: 'CANCELLED' }, slot: { court: { clubId } } },
      },
      select: { bookingId: true },
    }),
  ])
  const ids = [...new Set([
    anchor.id,
    ...fromEvents.map((row) => row.bookingId),
    ...fromPayments.map((row) => row.bookingId),
  ])].filter((id): id is string => Boolean(id))
  return prisma.booking.findMany({
    where: { id: { in: ids }, status: { not: 'CANCELLED' } },
    include: seriesBookingInclude,
    orderBy: [{ slot: { date: 'asc' } }, { slot: { startTime: 'asc' } }],
  })
}

/** All live court bookings tagged with this seasonBookingId (for list delete). */
export async function loadOwnerSeriesBookingsBySeasonId(
  clubId: string,
  seasonBookingId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const needle = seasonBookingIdNeedle(seasonBookingId)
  const [fromEvents, fromPayments] = await Promise.all([
    db.reservationEvent.findMany({
      where: {
        type: 'CREATED',
        metadataJson: { contains: needle },
        booking: { status: { not: 'CANCELLED' }, slot: { court: { clubId } } },
      },
      select: { bookingId: true },
    }),
    db.payment.findMany({
      where: {
        metadataJson: { contains: needle },
        booking: { status: { not: 'CANCELLED' }, slot: { court: { clubId } } },
      },
      select: { bookingId: true },
    }),
  ])
  const ids = [...new Set([
    ...fromEvents.map((row) => row.bookingId),
    ...fromPayments.map((row) => row.bookingId),
  ])].filter((id): id is string => Boolean(id))
  if (!ids.length) return []
  return db.booking.findMany({
    where: { id: { in: ids }, status: { not: 'CANCELLED' } },
    include: seriesBookingInclude,
    orderBy: [{ slot: { date: 'asc' } }, { slot: { startTime: 'asc' } }],
  })
}

export type OwnerSeriesCancelRow = {
  id: string
  slotId: string
  userId?: string | null
  slot: { date: string; startTime: string; endTime: string; courtId: string }
  payment?: { id: string; amount: number; status: string; metadataJson?: string | null } | null
}

/** Past played sessions stay booked; only not-yet-started slots are cancelled. */
export function partitionOwnerSeriesBySlotStart<T extends { slot: { date: string; startTime: string } }>(
  rows: T[],
  now = new Date(),
): { future: T[]; skippedPast: T[] } {
  const future: T[] = []
  const skippedPast: T[] = []
  for (const row of rows) {
    if (isSlotStartInPast(row.slot.date, row.slot.startTime, now)) {
      skippedPast.push(row)
    }
    else {
      future.push(row)
    }
  }
  return { future, skippedPast }
}

/**
 * Cancel future sessions in an owner season/package series.
 * Grouped season payments use pro-rata wallet credit (not a full primary refund).
 */
export async function cancelOwnerSeriesBookings(opts: {
  rows: OwnerSeriesCancelRow[]
  reason: string
  actorUserId?: string
  now?: Date
  moneyOutcome?: CancelMoneyOutcome
}): Promise<{ cancelled: number; skippedPast: number; refundTotal: number; cancelledBookingIds: string[] }> {
  const moneyOutcome = opts.moneyOutcome ?? 'full_wallet_refund'
  const { future, skippedPast } = partitionOwnerSeriesBySlotStart(opts.rows, opts.now)
  let refundTotal = 0
  const cancelledBookingIds: string[] = []

  for (const row of future) {
    const seriesAware = bookingLooksLikeSeriesPayment(row.payment?.metadataJson)
    if (seriesAware) {
      const refund = await cancelSeriesSessionWithSlot({
        bookingId: row.id,
        slotId: row.slotId,
        actorUserId: opts.actorUserId,
        userId: row.userId,
        reason: opts.reason,
        moneyOutcome,
      })
      if (refund?.amount) refundTotal += refund.amount
    }
    else {
      const result = await cancelCourtBooking({
        bookingId: row.id,
        slotId: row.slotId,
        actorUserId: opts.actorUserId,
        reason: opts.reason,
        paymentId: seriesCancelPaymentId(row.payment),
        userId: row.userId,
        moneyOutcome,
      })
      if (result.refund?.amount) refundTotal += result.refund.amount
    }
    cancelledBookingIds.push(row.id)
  }

  return {
    cancelled: future.length,
    skippedPast: skippedPast.length,
    refundTotal,
    cancelledBookingIds,
  }
}

/**
 * When every live court booking for a season row is cancelled, stamp cancelledAt so
 * the owner season list matches the calendar (avoids «فعال» + bogus edit-diff adds).
 */
export async function finalizeSeasonBookingIfNoActiveSessions(clubId: string, seasonBookingId: string) {
  const remaining = await loadOwnerSeriesBookingsBySeasonId(clubId, seasonBookingId)
  if (remaining.length > 0) return false
  await sweepSeasonPrimaryResidualIfFullyCancelled({ clubId, seasonBookingId })
  const updated = await prisma.seasonBooking.updateMany({
    where: { id: seasonBookingId, clubId, cancelledAt: null },
    data: { cancelledAt: new Date() },
  })
  return updated.count > 0
}

/**
 * When every court session for a season is cancelled but the grouped primary payment
 * still shows PAID (common after owner-season-edit pro-rata cancels), credit the residual
 * once and mark the payment REFUNDED.
 */
export async function sweepSeasonPrimaryResidualIfFullyCancelled(opts: {
  clubId: string
  seasonBookingId: string
  reason?: string
}) {
  const active = await loadOwnerSeriesBookingsBySeasonId(opts.clubId, opts.seasonBookingId)
  if (active.length > 0) return null

  const needle = seasonBookingIdNeedle(opts.seasonBookingId)
  const primaryPayment = await prisma.payment.findFirst({
    where: {
      amount: { gt: 0 },
      metadataJson: { contains: needle },
      booking: { slot: { court: { clubId: opts.clubId } } },
    },
    orderBy: { amount: 'desc' },
    include: { booking: { select: { id: true, userId: true } } },
  })
  if (!primaryPayment?.booking?.id || !isPaymentRefundable(primaryPayment.status)) return null

  return refundAfterSeriesSessionCancel({
    cancelledBookingId: primaryPayment.booking.id,
    userId: primaryPayment.booking.userId,
    reason: opts.reason || 'series-primary-residual-sweep',
    moneyOutcome: 'full_wallet_refund',
  })
}
