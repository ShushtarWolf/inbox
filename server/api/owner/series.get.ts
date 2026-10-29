import { personNotifyName } from '../../utils/bookingNotify'
import { loadOwnerSeriesBookings } from '../../utils/ownerSeriesCancel'
import { activeSlotBooking } from '../../utils/reservations'
import { ownerSeriesKey } from '#shared/ownerSeries.ts'
import { maxIsoDate } from '#shared/seasonSessions.ts'

/** Summary of the season / class-package series for a booked calendar slot. */
export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const query = getQuery(event)
  const slotId = typeof query.slotId === 'string' ? query.slotId.trim() : ''
  if (!slotId) throw createError({ statusCode: 400, statusMessage: 'slotId required' })

  const slot = await prisma.slot.findFirst({
    where: { id: slotId, court: { clubId: club.id } },
    include: {
      booking: {
        include: {
          payment: { select: { metadataJson: true } },
          events: { where: { type: 'CREATED' }, select: { metadataJson: true }, take: 4 },
        },
      },
    },
  })
  const booking = activeSlotBooking(slot?.booking)
  if (!booking) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const key = ownerSeriesKey({
    packageDraftId: booking.packageDraftId,
    paymentMetadataJson: booking.payment?.metadataJson,
    eventMetadataJson: booking.events.map((row) => row.metadataJson),
  })
  if (!key) {
    return {
      ok: true,
      kind: null,
      id: null,
      count: 0,
      startDate: null,
      finishDate: null,
      guestName: '',
      canEditRange: false,
    }
  }

  const series = await loadOwnerSeriesBookings(club.id, booking.id)
  const first = series[0]
  const last = series[series.length - 1]
  let startDate = first?.slot.date || null
  let finishDate = last?.slot.date || null
  let guestName = personNotifyName(first?.guestName, first?.guestFamily)
    || personNotifyName(first?.user?.name)
    || ''

  if (key.kind === 'season') {
    const season = await prisma.seasonBooking.findFirst({
      where: { id: key.id, clubId: club.id },
      select: {
        startDate: true,
        finishDate: true,
        guestName: true,
        guestFamily: true,
      },
    })
    if (season) {
      if (season.startDate) startDate = season.startDate
      finishDate = maxIsoDate(season.finishDate, finishDate) || finishDate
      if (!guestName) guestName = personNotifyName(season.guestName, season.guestFamily)
    }
  }

  return {
    ok: true,
    kind: key.kind,
    id: key.id,
    count: series.length,
    startDate,
    finishDate,
    guestName,
    canEditRange: key.kind === 'season',
  }
})
