import { seasonBookingIdNeedle } from '#shared/ownerSeries.ts'
import { cancelOwnerSeriesBookings, loadOwnerSeriesBookingsBySeasonId } from './ownerSeriesCancel'
import { prisma } from './prisma'

/**
 * Cancel future sessions for an owner season (frees slots), so the series can be
 * recreated with the same or edited schedule. Past sessions are left as-is.
 */
export async function cancelFutureSessionsForSeasonReplace(opts: {
  clubId: string
  seasonBookingId: string
}): Promise<void> {
  const { clubId, seasonBookingId } = opts
  const rows = await loadOwnerSeriesBookingsBySeasonId(clubId, seasonBookingId)
  if (!rows.length) return
  await cancelOwnerSeriesBookings({
    rows,
    reason: 'owner-season-replace',
    moneyOutcome: 'full_wallet_refund',
  })
}

/** Remove CREATED audit rows left on cancelled bookings after a season replace (optional cleanup). */
export async function pruneStaleSeasonCreatedEvents(opts: {
  clubId: string
  seasonBookingId: string
}): Promise<void> {
  const needle = seasonBookingIdNeedle(opts.seasonBookingId)
  await prisma.reservationEvent.deleteMany({
    where: {
      type: 'CREATED',
      metadataJson: { contains: needle },
      booking: { status: 'CANCELLED', slot: { court: { clubId: opts.clubId } } },
    },
  })
}
