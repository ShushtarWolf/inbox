import { isPaymentRefundable } from '#shared/bookingPayment.ts'
import { notifyBookingCancelled, clubNotifyName } from '../../../utils/bookingNotify'
import { cancelCourtBooking } from '../../../utils/cancellations'
import { refundPaymentForCancellation } from '../../../utils/refunds'
import { canManageReservation } from '../../../utils/reservations'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  const booking = await prisma.booking.findFirst({
    where: { id, userId: user.id },
    include: { slot: { include: { court: { include: { club: true } } } }, payment: true, user: true },
  })
  if (!booking) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  // Already cancelled: still retry refund if payment stayed PAID (non-atomic cancel→refund).
  if (booking.status === 'CANCELLED') {
    if (booking.payment?.id && isPaymentRefundable(booking.payment.status)) {
      try {
        const refund = await refundPaymentForCancellation({
          paymentId: booking.payment.id,
          userId: booking.userId,
          bookingId: booking.id,
          reason: 'athlete-cancel-refund-retry',
        })
        return { ok: true, refund }
      }
      catch (err) {
        console.error('[cancel:refund-retry]', booking.id, err)
        return { ok: true }
      }
    }
    return { ok: true }
  }

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

  await notifyBookingCancelled({
    userId: user.id,
    email: booking.user?.email,
    phone: booking.user?.phone,
    kind: 'court',
    clubName: clubNotifyName(booking.slot.court.club),
    clubId: booking.slot.court.clubId,
    bookingId: booking.id,
    date: booking.slot.date,
    startTime: booking.slot.startTime,
    endTime: booking.slot.endTime,
    reason: 'athlete-cancel',
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
