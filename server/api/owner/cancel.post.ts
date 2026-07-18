import { notifyBookingCancelled } from '../../utils/bookingNotify'
import { cancelCourtBooking } from '../../utils/cancellations'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const body = await readBody<{
    slotId?: string
    reason?: string
  }>(event)
  if (!body.slotId) throw createError({ statusCode: 400, statusMessage: 'slotId required' })

  const slot = await prisma.slot.findFirst({
    where: { id: body.slotId, court: { clubId: club.id } },
    include: { booking: { include: { payment: true, user: true } }, court: true },
  })
  if (!slot) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  if (slot.booking) {
    const reason = body.reason || 'owner-cancel'
    await cancelCourtBooking({
      bookingId: slot.booking.id,
      slotId: slot.id,
      reason,
      paymentId: slot.booking.payment?.id,
      userId: slot.booking.userId,
    })
    const phone = slot.booking.user?.phone || slot.booking.guestMobile
    if (slot.booking.userId || phone) {
      await notifyBookingCancelled({
        userId: slot.booking.userId,
        email: slot.booking.user?.email,
        phone,
        kind: 'court',
        clubName: club.nameEn || club.nameFa,
        clubId: club.id,
        bookingId: slot.booking.id,
        date: slot.date,
        startTime: slot.startTime,
        reason,
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
