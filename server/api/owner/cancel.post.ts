import {
  notifyBookingCancelled,
  clubNotifyName,
  courtNotifyName,
  personNotifyName,
} from '../../utils/bookingNotify'
import { cancelCourtBooking } from '../../utils/cancellations'
import { normalizeIranPhone } from '#shared/phone.ts'
import { activeSlotBooking } from '../../utils/reservations'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const body = await readBody<{
    slotId?: string
    reason?: string
    refundToWallet?: boolean
  }>(event)
  if (!body.slotId) throw createError({ statusCode: 400, statusMessage: 'slotId required' })

  const slot = await prisma.slot.findFirst({
    where: { id: body.slotId, court: { clubId: club.id } },
    include: { booking: { include: { payment: true, user: true } }, court: true },
  })
  if (!slot) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const booking = activeSlotBooking(slot.booking)
  if (booking) {
    const reason = body.reason || 'owner-cancel'
    await cancelCourtBooking({
      bookingId: booking.id,
      slotId: slot.id,
      reason,
      paymentId: booking.payment?.id,
      userId: booking.userId,
      skipWallet: body.refundToWallet === false,
    })
    const rawGuest = booking.guestMobile
    const phone = booking.user?.phone || (rawGuest ? normalizeIranPhone(rawGuest) || rawGuest : null)
    if (booking.userId || phone) {
      await notifyBookingCancelled({
        userId: booking.userId,
        email: booking.user?.email,
        phone,
        kind: 'court',
        clubName: clubNotifyName(club),
        clubId: club.id,
        bookingId: booking.id,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        reason,
        guestName: personNotifyName(booking.guestName, booking.guestFamily)
          || personNotifyName(booking.user?.name),
        courtName: courtNotifyName(slot.court),
      })
    }
  } else {
    await prisma.slot.update({
      where: { id: slot.id },
      data: { displayStatus: 'FREE' },
    })
  }

  await notifyWaitlistForFreedSlot({
    clubId: club.id,
    courtId: slot.courtId,
    date: slot.date,
    startTime: slot.startTime,
    endTime: slot.endTime,
  })

  return { ok: true }
})
