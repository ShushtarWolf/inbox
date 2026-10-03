import { canCancelReservation, resolveCancelMoneyOutcome } from '#shared/cancelPolicy.ts'
import { isPaymentRefundable } from '#shared/bookingPayment.ts'
import { normalizeIranPhone } from '#shared/phone.ts'
import {
  notifyBookingCancelled,
  notifyOwnerBookingCancelled,
  clubNotifyName,
  courtNotifyName,
  ownerNotifyPhone,
  personNotifyName,
} from '../../../utils/bookingNotify'
import { cancelCourtBooking } from '../../../utils/cancellations'
import { refundPaymentForCancellation } from '../../../utils/refunds'
import {
  bookingLooksLikeSeriesPayment,
  cancelUnpaidSeriesSiblings,
  loadSeriesGroupForBooking,
  refundAfterSeriesSessionCancel,
} from '../../../utils/seriesCancelRefund'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  const booking = await prisma.booking.findFirst({
    where: { id, userId: user.id },
    include: {
      slot: { include: { court: { include: { club: { include: { owner: true } } } } } },
      payment: true,
      user: true,
    },
  })
  if (!booking) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const seriesAware = bookingLooksLikeSeriesPayment(booking.payment?.metadataJson)
  const windowHours = booking.slot.court.club.cancellationWindowHours
  const moneyOutcome = resolveCancelMoneyOutcome({
    actor: 'athlete',
    date: booking.slot.date,
    startTime: booking.slot.startTime,
    windowHours,
  })

  // Already cancelled: still retry refund if payment stayed PAID (non-atomic cancel→refund).
  if (booking.status === 'CANCELLED') {
    if (moneyOutcome === 'zero_refund') return { ok: true, moneyOutcome }
    if (seriesAware) {
      try {
        const refund = await refundAfterSeriesSessionCancel({
          cancelledBookingId: booking.id,
          userId: booking.userId,
          reason: 'athlete-cancel-refund-retry',
          moneyOutcome,
        })
        return { ok: true, refund, moneyOutcome }
      }
      catch (err) {
        console.error('[cancel:series-refund-retry]', booking.id, err)
        return { ok: true, moneyOutcome }
      }
    }
    if (booking.payment?.id && isPaymentRefundable(booking.payment.status)) {
      try {
        const refund = await refundPaymentForCancellation({
          paymentId: booking.payment.id,
          userId: booking.userId,
          bookingId: booking.id,
          reason: 'athlete-cancel-refund-retry',
          moneyOutcome,
        })
        return { ok: true, refund, moneyOutcome }
      }
      catch (err) {
        console.error('[cancel:refund-retry]', booking.id, err)
        return { ok: true, moneyOutcome }
      }
    }
    return { ok: true, moneyOutcome }
  }

  if (!canCancelReservation({
    actor: 'athlete',
    date: booking.slot.date,
    startTime: booking.slot.startTime,
  })) {
    throw createError({ statusCode: 409, statusMessage: 'Slot already started' })
  }

  // Series: cancel row without auto full-refund; apply pro-rata against primary after.
  const result = await cancelCourtBooking({
    bookingId: id!,
    slotId: booking.slotId,
    actorUserId: user.id,
    reason: 'athlete-cancel',
    paymentId: seriesAware ? null : booking.payment?.id,
    userId: booking.userId,
    moneyOutcome,
  })

  let refund = result.refund
  let refundFailed = result.refundFailed

  if (seriesAware) {
    const group = await loadSeriesGroupForBooking(booking.id)
    const isPrimary = group?.group.primaryBookingId === booking.id
    const unpaid = !group || !isPaymentRefundable(group.primaryPayment.status)

    if (isPrimary && unpaid) {
      await cancelUnpaidSeriesSiblings({
        primaryBookingId: booking.id,
        actorUserId: user.id,
        reason: 'athlete-cancel-series-unpaid',
        userId: booking.userId,
      })
    }

    try {
      refund = await refundAfterSeriesSessionCancel({
        cancelledBookingId: booking.id,
        userId: booking.userId,
        reason: 'athlete-cancel',
        moneyOutcome,
      })
      refundFailed = false
    }
    catch (err) {
      console.error('[cancel:series-refund]', booking.id, err)
      refundFailed = true
    }
  }

  const club = booking.slot.court.club
  const phone = booking.user?.phone || normalizeIranPhone(booking.guestMobile) || booking.guestMobile
  const guestName = personNotifyName(booking.guestName, booking.guestFamily) || personNotifyName(booking.user?.name)
  const courtName = courtNotifyName(booking.slot.court)
  const clubName = clubNotifyName(club)

  await notifyBookingCancelled({
    userId: user.id,
    email: booking.user?.email,
    phone,
    kind: 'court',
    clubName,
    clubId: club.id,
    bookingId: booking.id,
    date: booking.slot.date,
    startTime: booking.slot.startTime,
    endTime: booking.slot.endTime,
    courtName,
    guestName,
    reason: 'athlete-cancel',
  })

  await notifyOwnerBookingCancelled({
    ownerPhone: ownerNotifyPhone(club),
    clubName,
    clubId: club.id,
    bookingId: booking.id,
    date: booking.slot.date,
    startTime: booking.slot.startTime,
    endTime: booking.slot.endTime,
    courtName,
    guestName,
    guestPhone: phone,
  })

  await notifyWaitlistForFreedSlot({
    clubId: club.id,
    courtId: booking.slot.courtId,
    date: booking.slot.date,
    startTime: booking.slot.startTime,
    endTime: booking.slot.endTime,
  })

  return { ok: true, refund, refundFailed, moneyOutcome }
})
