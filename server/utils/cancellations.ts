import { refundPaymentForCancellation } from './refunds'

export async function cancelCourtBooking(options: {
  bookingId: string
  slotId: string
  actorUserId?: string
  reason: string
  paymentId?: string | null
  userId?: string | null
}) {
  let refund: Awaited<ReturnType<typeof refundPaymentForCancellation>> | null = null

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: options.bookingId },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: options.reason },
    })
    await tx.slot.update({ where: { id: options.slotId }, data: { displayStatus: 'FREE' } })
    await tx.reservationEvent.create({
      data: {
        bookingId: options.bookingId,
        actorUserId: options.actorUserId,
        type: 'CANCELLED',
        metadataJson: JSON.stringify({ reason: options.reason }),
      },
    })
  })

  if (options.paymentId) {
    refund = await refundPaymentForCancellation({
      paymentId: options.paymentId,
      userId: options.userId,
      bookingId: options.bookingId,
      reason: options.reason,
    })
  }

  return { ok: true, refund }
}

export async function cancelCoachSession(options: {
  sessionId: string
  actorUserId?: string
  reason: string
  paymentId?: string | null
  userId?: string | null
}) {
  let refund: Awaited<ReturnType<typeof refundPaymentForCancellation>> | null = null

  await prisma.$transaction(async (tx) => {
    await tx.coachSession.update({
      where: { id: options.sessionId },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: options.reason },
    })
    await tx.reservationEvent.create({
      data: {
        coachSessionId: options.sessionId,
        actorUserId: options.actorUserId,
        type: 'CANCELLED',
        metadataJson: JSON.stringify({ reason: options.reason }),
      },
    })
  })

  if (options.paymentId) {
    refund = await refundPaymentForCancellation({
      paymentId: options.paymentId,
      userId: options.userId,
      reason: options.reason,
    })
  }

  return { ok: true, refund }
}

export async function cancelPackageBooking(options: {
  packageBookingId: string
  actorUserId?: string
  reason: string
  paymentId?: string | null
  userId: string
}) {
  let refund: Awaited<ReturnType<typeof refundPaymentForCancellation>> | null = null

  await prisma.$transaction(async (tx) => {
    await tx.packageBooking.update({
      where: { id: options.packageBookingId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    })
  })

  if (options.paymentId) {
    refund = await refundPaymentForCancellation({
      paymentId: options.paymentId,
      userId: options.userId,
      reason: options.reason,
    })
  }

  return { ok: true, refund }
}
