import { canManageReservation } from '../../../utils/reservations'
import { cancelCourtBooking } from '../../../utils/cancellations'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  const booking = await prisma.booking.findFirst({
    where: { id, userId: user.id },
    include: { slot: { include: { court: { include: { club: true } } } }, payment: true },
  })
  if (!booking) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  if (booking.status === 'CANCELLED') return { ok: true }
  if (!canManageReservation(booking.slot.date, booking.slot.startTime, booking.slot.court.club.cancellationWindowHours)) {
    throw createError({ statusCode: 409, statusMessage: 'Cancellation window has passed' })
  }

  const result = await cancelCourtBooking({
    bookingId: id!,
    slotId: booking.slotId,
    actorUserId: user.id,
    reason: 'athlete-cancel',
    paymentId: booking.payment?.id,
    userId: booking.userId,
  })

  await notifyWaitlistForFreedSlot({
    clubId: booking.slot.court.clubId,
    courtId: booking.slot.courtId,
    date: booking.slot.date,
    startTime: booking.slot.startTime,
    endTime: booking.slot.endTime,
  })

  return result
})
