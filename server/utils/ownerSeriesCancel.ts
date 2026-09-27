import { ownerSeriesKey, seasonBookingIdNeedle } from '#shared/ownerSeries.ts'
import { prisma } from './prisma'

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
  ])]
  return prisma.booking.findMany({
    where: { id: { in: ids }, status: { not: 'CANCELLED' } },
    include: seriesBookingInclude,
    orderBy: [{ slot: { date: 'asc' } }, { slot: { startTime: 'asc' } }],
  })
}
