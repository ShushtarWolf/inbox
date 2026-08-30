import { syncClubContactForBooking } from './contactSync'
import { refundPaymentForCancellation } from './refunds'

// A coach-booked lesson court and its lesson are two halves of one reservation: the student
// pays the coach fee, the coach's wallet pays the full listed court fee. Cancelling either half
// must unwind the other, or one side keeps money for a lesson that will not happen. The two
// cancel functions below call each other with the sibling's skip flag set, which bounds recursion.

export async function cancelCourtBooking(options: {
  bookingId: string
  slotId: string
  actorUserId?: string
  reason: string
  paymentId?: string | null
  userId?: string | null
  skipWallet?: boolean
  skipLinkedCoachSession?: boolean
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
  await syncClubContactForBooking(options.bookingId)

  if (!options.skipLinkedCoachSession) {
    await cancelLessonForCancelledCourt(options.bookingId, options.actorUserId, options.reason)
  }

  if (options.paymentId) {
    try {
      refund = await refundPaymentForCancellation({
        paymentId: options.paymentId,
        userId: options.userId,
        bookingId: options.bookingId,
        reason: options.reason,
        skipWallet: options.skipWallet,
      })
    }
    catch (err) {
      // Slot is already FREE — never 500 the cancel path on refund/wallet/SMS side effects.
      console.error('[cancelCourtBooking:refund]', options.bookingId, err)
      return { ok: true, refund: null, refundFailed: true as const }
    }
  }

  return { ok: true, refund, refundFailed: false as const }
}

/** The club pulled the court out from under a lesson — refund the student their coach fee. */
async function cancelLessonForCancelledCourt(bookingId: string, actorUserId: string | undefined, reason: string) {
  const session = await prisma.coachSession.findUnique({
    where: { courtBookingId: bookingId },
    include: { payment: true },
  })
  if (!session || session.status === 'CANCELLED') return

  try {
    await cancelCoachSession({
      sessionId: session.id,
      actorUserId,
      reason,
      paymentId: session.payment?.id,
      userId: session.athleteId,
      skipLinkedCourt: true,
    })
  }
  catch (err) {
    console.error('[cancelCourtBooking:linkedLesson]', bookingId, err)
  }
}

export async function cancelCoachSession(options: {
  sessionId: string
  actorUserId?: string
  reason: string
  paymentId?: string | null
  userId?: string | null
  skipLinkedCourt?: boolean
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

  if (!options.skipLinkedCourt) {
    await releaseCourtForCancelledLesson(options.sessionId, options.actorUserId, options.reason)
  }

  if (options.paymentId) {
    refund = await refundPaymentForCancellation({
      paymentId: options.paymentId,
      userId: options.userId,
      reason: options.reason,
    })
  }

  return { ok: true, refund }
}

/** Free the court the coach reserved and put the listed court fee back in their wallet. */
async function releaseCourtForCancelledLesson(sessionId: string, actorUserId: string | undefined, reason: string) {
  const session = await prisma.coachSession.findUnique({
    where: { id: sessionId },
    select: {
      courtBooking: {
        select: { id: true, slotId: true, status: true, userId: true, payment: { select: { id: true } } },
      },
    },
  })
  const booking = session?.courtBooking
  if (!booking || booking.status === 'CANCELLED') return

  try {
    await cancelCourtBooking({
      bookingId: booking.id,
      slotId: booking.slotId,
      actorUserId,
      reason,
      paymentId: booking.payment?.id,
      // The coach paid for this court from their wallet, so the credit goes back to them.
      userId: booking.userId,
      skipLinkedCoachSession: true,
    })
  }
  catch (err) {
    console.error('[cancelCoachSession:linkedCourt]', sessionId, err)
  }
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
