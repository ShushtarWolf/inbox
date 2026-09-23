import { normalizeGuestNamePair } from '#shared/guestName.ts'
import { assertAthleteSeasonEnabled } from '../../utils/athleteSeasonGate'
import { previewAthleteWeeklySeason } from '../../utils/athleteSeasonPreview'
import { requireOnlinePaymentsForAthlete } from '../../utils/requireOnlinePayments'
import { createSeasonSessions } from '../../utils/seasonReserve'
import { releaseExpiredOnlinePaymentHolds } from '../../utils/onlinePaymentHold'

export default defineEventHandler(async (event) => {
  assertAthleteSeasonEnabled(event)
  const user = await requireUser(event)
  requireOnlinePaymentsForAthlete()

  const body = await readBody<{
    clubId?: string
    courtId?: string
    startDate?: string
    finishDate?: string
    startTime?: string
    endTime?: string
  }>(event)

  const clubId = String(body.clubId || '').trim()
  if (!clubId) throw createError({ statusCode: 400, statusMessage: 'clubId required' })

  const club = await prisma.club.findFirst({
    where: { id: clubId, status: 'ACTIVE' },
    select: { id: true },
  })
  if (!club) throw createError({ statusCode: 404, statusMessage: 'Club not found' })

  const preview = await previewAthleteWeeklySeason({
    clubId,
    courtId: String(body.courtId || '').trim(),
    startDate: String(body.startDate || '').trim(),
    finishDate: String(body.finishDate || '').trim(),
    startTime: String(body.startTime || '').trim(),
    endTime: body.endTime ? String(body.endTime).trim() : undefined,
  })

  if (preview.willCreateCount === 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'RECURRING_NO_FREE_SLOTS',
      data: { conflicts: preview.conflicts, skippedCount: preview.skippedCount },
    })
  }

  // Free stale unpaid holds that might block the same clock times.
  await releaseExpiredOnlinePaymentHolds({ clubId })

  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
  const guest = normalizeGuestNamePair(dbUser.name || '', '')

  const result = await createSeasonSessions({
    clubId,
    sessions: preview.willCreate.map((row) => ({
      date: row.date,
      startTime: row.startTime,
      courtId: row.courtId,
    })),
    guestName: guest.guestName,
    guestFamily: guest.guestFamily,
    guestMobile: dbUser.phone || '',
    paymentMethod: 'IPG',
    paymentStatus: 'PAY_AT_CLUB',
    mode: 'athlete',
    forceUserId: user.id,
    actorUserId: user.id,
  })

  if (!result.primaryBookingId) {
    throw createError({ statusCode: 500, statusMessage: 'Season create failed' })
  }

  const primary = await prisma.booking.findUniqueOrThrow({
    where: { id: result.primaryBookingId },
    select: { paymentStatus: true },
  })

  return {
    id: result.primaryBookingId,
    paymentStatus: primary.paymentStatus,
    bookingIds: result.bookingIds,
    totalAmount: result.totalAmount,
    seasonBookingId: result.seasonBookingId,
    willCreateCount: result.slotsCreated,
    skippedCount: result.slotsSkipped,
    conflicts: result.conflicts,
  }
})
