import { isSlotStartInPast } from '#shared/localDate.ts'
import { ownerSeriesKey, seasonBookingIdNeedle, seriesCancelPaymentId } from '#shared/ownerSeries.ts'
import type { CancelMoneyOutcome } from '#shared/cancelPolicy.ts'
import { cancelCourtBooking } from './cancellations'
import { prisma } from './prisma'
import { bookingLooksLikeSeriesPayment, refundAfterSeriesSessionCancel } from './seriesCancelRefund'

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
    const result = await cancelCourtBooking({
      bookingId: row.id,
      slotId: row.slotId,
      actorUserId: opts.actorUserId,
      reason: opts.reason,
      paymentId: seriesAware ? null : seriesCancelPaymentId(row.payment),
      userId: row.userId,
      moneyOutcome,
    })
    if (result.refund?.amount) refundTotal += result.refund.amount

    if (seriesAware) {
      try {
        const refund = await refundAfterSeriesSessionCancel({
          cancelledBookingId: row.id,
          userId: row.userId,
          reason: opts.reason,
          moneyOutcome,
        })
        if (refund?.amount) refundTotal += refund.amount
      }
      catch (err) {
        console.error('[cancelOwnerSeries:series-refund]', row.id, err)
      }
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
