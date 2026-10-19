import { isSeriesDeskPaymentTarget } from '#shared/ownerSeries.ts'
import { normalizeIranPhone } from '#shared/phone.ts'
import {
  notifyBookingPaid,
  notifyOwnerBookingPaid,
  clubNotifyName,
  courtNotifyName,
  ownerNotifyPhone,
  personNotifyName,
} from '../../utils/bookingNotify'
import { releaseExpiredOnlinePaymentHolds } from '../../utils/onlinePaymentHold'
import { loadOwnerSeriesBookings } from '../../utils/ownerSeriesCancel'
import { activeSlotBooking } from '../../utils/reservations'

/**
 * Desk cash for a whole season/class package in one go.
 * Existing payment amounts are kept: pay-link seasons hold the total on the primary row.
 */
export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const body = await readBody<{ slotId?: string; paymentStatus?: string; dryRun?: boolean }>(event)
  if (!body.slotId) throw createError({ statusCode: 400, statusMessage: 'slotId required' })
  const next = body.paymentStatus === 'PAID' ? 'PAID' : 'PAY_AT_CLUB'

  await releaseExpiredOnlinePaymentHolds({ clubId: club.id })
  const slot = await prisma.slot.findFirst({
    where: { id: body.slotId, court: { clubId: club.id } },
    include: { booking: true },
  })
  const booking = activeSlotBooking(slot?.booking)
  if (!booking) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const series = await loadOwnerSeriesBookings(club.id, booking.id)
  const targets = series.filter((row) => isSeriesDeskPaymentTarget(row, next))
  const amount = targets.reduce((sum, row) => sum + (row.payment?.amount ?? row.slot.price ?? 0), 0)
  if (body.dryRun || !targets.length) return { ok: true, count: targets.length, amount }

  await prisma.$transaction(async (tx) => {
    for (const row of targets) {
      await tx.booking.update({
        where: { id: row.id },
        data: { paymentStatus: next, paymentMethod: 'CASH', status: 'CONFIRMED' },
      })
      await tx.payment.upsert({
        where: { bookingId: row.id },
        update: { method: 'CASH', status: next },
        create: { bookingId: row.id, amount: row.slot.price ?? 0, method: 'CASH', status: next },
      })
    }
  })

  // One SMS for the whole package, not one per session.
  if (next === 'PAID') {
    const first = targets[0]!
    const phone = first.user?.phone || (first.guestMobile ? normalizeIranPhone(first.guestMobile) || first.guestMobile : null)
    const guestName = personNotifyName(first.guestName, first.guestFamily) || first.user?.name || ''
    const notify = {
      clubId: club.id,
      bookingId: first.id,
      date: first.slot.date,
      startTime: first.slot.startTime,
      endTime: first.slot.endTime,
      courtName: courtNotifyName(first.slot.court),
      guestName,
    }
    if (first.userId || phone) {
      await notifyBookingPaid({
        ...notify,
        userId: first.userId,
        email: first.user?.email,
        phone,
        kind: 'court',
        clubName: clubNotifyName(club),
        amountPaid: amount,
        paymentPaid: true,
      })
    }
    const ownerClub = await prisma.club.findUnique({
      where: { id: club.id },
      select: { phone: true, nameFa: true, nameEn: true, owner: { select: { phone: true } } },
    })
    await notifyOwnerBookingPaid({
      ...notify,
      ownerPhone: ownerClub ? ownerNotifyPhone(ownerClub) : club.phone,
      clubName: clubNotifyName(ownerClub || club),
      guestPhone: phone,
      amountPaid: amount,
    })
  }

  return { ok: true, count: targets.length, amount }
})
