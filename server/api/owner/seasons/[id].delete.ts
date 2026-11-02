import { cancelOwnerSeriesBookings, loadOwnerSeriesBookingsBySeasonId } from '../../../utils/ownerSeriesCancel'
import { notifyWaitlistForFreedSlot } from '../../../utils/waitlistNotify'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const id = getRouterParam(event, 'id')?.trim()
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const season = await prisma.seasonBooking.findFirst({
    where: { id, clubId: club.id },
    select: { id: true },
  })
  if (!season) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const rows = await loadOwnerSeriesBookingsBySeasonId(club.id, id)
  let cancelled = 0
  if (rows.length) {
    const result = await cancelOwnerSeriesBookings({
      rows,
      reason: 'owner-season-delete',
      moneyOutcome: 'full_wallet_refund',
    })
    cancelled = result.cancelled
    const cancelledIds = new Set(result.cancelledBookingIds)
    for (const row of rows) {
      if (!cancelledIds.has(row.id)) continue
      await notifyWaitlistForFreedSlot({
        clubId: club.id,
        courtId: row.slot.courtId,
        date: row.slot.date,
        startTime: row.slot.startTime,
        endTime: row.slot.endTime,
      })
    }
  }

  // Soft-cancel: keep the row so the owner list shows «لغو شده» instead of it vanishing.
  await prisma.seasonBooking.update({ where: { id }, data: { cancelledAt: new Date() } })

  return { ok: true, cancelled }
})
