import type { CancelMoneyOutcome } from '#shared/cancelPolicy.ts'
import { syncClubContactForBooking } from './contactSync'
import { syncPaymentToParent } from './paymentSync'
import { refundPaymentForCancellation, type RefundResult } from './refunds'

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
  /** @deprecated Prefer moneyOutcome. */
  skipWallet?: boolean
  moneyOutcome?: CancelMoneyOutcome
  skipLinkedCoachSession?: boolean
}) {
  const moneyOutcome = options.moneyOutcome
    || (options.skipWallet ? 'zero_refund' : 'full_wallet_refund')

  // Load linked lesson before the txn so we can cancel + refund both atomically.
  const linkedSession = options.skipLinkedCoachSession
    ? null
    : await prisma.coachSession.findUnique({
        where: { courtBookingId: options.bookingId },
        include: { payment: true },
      })
  const linkedActive = linkedSession && linkedSession.status !== 'CANCELLED' ? linkedSession : null

  let refund: RefundResult | null = null
  let linkedRefund: RefundResult | null = null
  const paymentsToSync: string[] = []

  try {
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

      if (options.paymentId) {
        refund = await refundPaymentForCancellation({
          paymentId: options.paymentId,
          userId: options.userId,
          bookingId: options.bookingId,
          reason: options.reason,
          moneyOutcome,
          db: tx,
          syncParent: false,
        })
        if (refund.refunded) paymentsToSync.push(options.paymentId)
      }

      if (linkedActive) {
        await tx.coachSession.update({
          where: { id: linkedActive.id },
          data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: options.reason },
        })
        await tx.reservationEvent.create({
          data: {
            coachSessionId: linkedActive.id,
            actorUserId: options.actorUserId,
            type: 'CANCELLED',
            metadataJson: JSON.stringify({ reason: options.reason }),
          },
        })
        if (linkedActive.payment?.id) {
          linkedRefund = await refundPaymentForCancellation({
            paymentId: linkedActive.payment.id,
            userId: linkedActive.athleteId,
            reason: options.reason,
            moneyOutcome,
            db: tx,
            syncParent: false,
          })
          if (linkedRefund.refunded) paymentsToSync.push(linkedActive.payment.id)
        }
      }
    })
  }
  catch (err) {
    // Entire cancel+refund rolled back — slot stays booked, no orphan FREE without money.
    console.error('[cancelCourtBooking]', options.bookingId, err)
    throw err
  }

  await syncClubContactForBooking(options.bookingId)
  for (const paymentId of paymentsToSync) {
    try {
      await syncPaymentToParent(paymentId)
    }
    catch (err) {
      console.error('[cancelCourtBooking:syncParent]', paymentId, err)
    }
  }

  return {
    ok: true as const,
    refund,
    linkedRefund,
    refundFailed: false as const,
  }
}

export async function cancelCoachSession(options: {
  sessionId: string
  actorUserId?: string
  reason: string
  paymentId?: string | null
  userId?: string | null
  skipLinkedCourt?: boolean
  moneyOutcome?: CancelMoneyOutcome
}) {
  const moneyOutcome = options.moneyOutcome || 'full_wallet_refund'

  const session = await prisma.coachSession.findUnique({
    where: { id: options.sessionId },
    select: {
      id: true,
      status: true,
      courtBooking: {
        select: { id: true, slotId: true, status: true, userId: true, payment: { select: { id: true } } },
      },
    },
  })
  if (!session) {
    throw createError({ statusCode: 404, statusMessage: 'Coach session not found' })
  }

  const linkedCourt = !options.skipLinkedCourt
    && session.courtBooking
    && session.courtBooking.status !== 'CANCELLED'
    ? session.courtBooking
    : null

  let refund: RefundResult | null = null
  let courtRefund: RefundResult | null = null
  const paymentsToSync: string[] = []

  try {
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

      if (options.paymentId) {
        refund = await refundPaymentForCancellation({
          paymentId: options.paymentId,
          userId: options.userId,
          reason: options.reason,
          moneyOutcome,
          db: tx,
          syncParent: false,
        })
        if (refund.refunded) paymentsToSync.push(options.paymentId)
      }

      if (linkedCourt) {
        await tx.booking.update({
          where: { id: linkedCourt.id },
          data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: options.reason },
        })
        await tx.slot.update({ where: { id: linkedCourt.slotId }, data: { displayStatus: 'FREE' } })
        await tx.reservationEvent.create({
          data: {
            bookingId: linkedCourt.id,
            actorUserId: options.actorUserId,
            type: 'CANCELLED',
            metadataJson: JSON.stringify({ reason: options.reason }),
          },
        })
        if (linkedCourt.payment?.id) {
          courtRefund = await refundPaymentForCancellation({
            paymentId: linkedCourt.payment.id,
            userId: linkedCourt.userId,
            bookingId: linkedCourt.id,
            reason: options.reason,
            moneyOutcome,
            db: tx,
            syncParent: false,
          })
          if (courtRefund.refunded) paymentsToSync.push(linkedCourt.payment.id)
        }
      }
    })
  }
  catch (err) {
    console.error('[cancelCoachSession]', options.sessionId, err)
    throw err
  }

  if (linkedCourt) {
    await syncClubContactForBooking(linkedCourt.id)
  }
  for (const paymentId of paymentsToSync) {
    try {
      await syncPaymentToParent(paymentId)
    }
    catch (err) {
      console.error('[cancelCoachSession:syncParent]', paymentId, err)
    }
  }

  return { ok: true as const, refund, courtRefund }
}

export async function cancelPackageBooking(options: {
  packageBookingId: string
  actorUserId?: string
  reason: string
  paymentId?: string | null
  userId: string
  moneyOutcome?: CancelMoneyOutcome
}) {
  const moneyOutcome = options.moneyOutcome || 'full_wallet_refund'
  let refund: RefundResult | null = null

  try {
    await prisma.$transaction(async (tx) => {
      await tx.packageBooking.update({
        where: { id: options.packageBookingId },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      })

      if (options.paymentId) {
        refund = await refundPaymentForCancellation({
          paymentId: options.paymentId,
          userId: options.userId,
          reason: options.reason,
          moneyOutcome,
          db: tx,
          syncParent: false,
        })
      }
    })
  }
  catch (err) {
    console.error('[cancelPackageBooking]', options.packageBookingId, err)
    throw err
  }

  if (options.paymentId && refund?.refunded) {
    try {
      await syncPaymentToParent(options.paymentId)
    }
    catch (err) {
      console.error('[cancelPackageBooking:syncParent]', options.paymentId, err)
    }
  }

  return { ok: true as const, refund }
}
