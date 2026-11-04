import { parsePaymentMetadata } from '#shared/cancelRefund.ts'
import { cancelCoachSession, cancelCourtBooking, cancelPackageBooking } from './cancellations'
import { prisma } from './prisma'
import { refundPaymentForCancellation } from './refunds'

export { paymentIdsBlockedForWithdraw } from './reversedStillPaid'

/**
 * Card already reversed at SEP (`gatewayReversed`) but Payment still PAID —
 * booking/settlement still live until cancel is re-run. Heal by re-cancelling
 * so refund takes the gateway_reverse path (no double wallet credit) + clawback.
 */
export async function healReversedStillPaidPayments(limit = 20) {
  const candidates = await prisma.payment.findMany({
    where: {
      status: 'PAID',
      metadataJson: { contains: '"gatewayReversed":true' },
    },
    select: {
      id: true,
      userId: true,
      bookingId: true,
      coachSessionId: true,
      packageBookingId: true,
      metadataJson: true,
      booking: { select: { id: true, slotId: true, userId: true, status: true } },
      coachSession: { select: { id: true, athleteId: true, status: true } },
      packageBooking: { select: { id: true, athleteId: true, status: true } },
    },
    take: limit,
    orderBy: { updatedAt: 'asc' },
  })

  const results: Array<{ paymentId: string, ok: boolean, reason: string }> = []

  for (const payment of candidates) {
    try {
      const m = parsePaymentMetadata(payment.metadataJson)
      if (m.gatewayReversed !== true) {
        results.push({ paymentId: payment.id, ok: false, reason: 'not_reversed' })
        continue
      }

      if (payment.bookingId && payment.booking && payment.booking.status !== 'CANCELLED') {
        await cancelCourtBooking({
          bookingId: payment.booking.id,
          slotId: payment.booking.slotId,
          paymentId: payment.id,
          userId: payment.booking.userId || payment.userId,
          reason: 'heal-reversed-still-paid',
          moneyOutcome: 'full_wallet_refund',
        })
        results.push({ paymentId: payment.id, ok: true, reason: 'court_cancelled' })
        continue
      }

      if (payment.coachSessionId && payment.coachSession && payment.coachSession.status !== 'CANCELLED') {
        await cancelCoachSession({
          sessionId: payment.coachSession.id,
          paymentId: payment.id,
          userId: payment.coachSession.athleteId || payment.userId,
          reason: 'heal-reversed-still-paid',
          moneyOutcome: 'full_wallet_refund',
        })
        results.push({ paymentId: payment.id, ok: true, reason: 'coach_cancelled' })
        continue
      }

      if (
        payment.packageBookingId
        && payment.packageBooking
        && payment.packageBooking.status !== 'CANCELLED'
      ) {
        await cancelPackageBooking({
          packageBookingId: payment.packageBooking.id,
          paymentId: payment.id,
          userId: payment.packageBooking.athleteId,
          reason: 'heal-reversed-still-paid',
          moneyOutcome: 'full_wallet_refund',
        })
        results.push({ paymentId: payment.id, ok: true, reason: 'package_cancelled' })
        continue
      }

      // Parent already cancelled (or top-up / orphan) — still mark REFUNDED + clawback.
      const refund = await refundPaymentForCancellation({
        paymentId: payment.id,
        userId: payment.userId,
        bookingId: payment.bookingId || undefined,
        reason: 'heal-reversed-still-paid',
        moneyOutcome: 'full_wallet_refund',
      })
      results.push({
        paymentId: payment.id,
        ok: refund.refunded,
        reason: refund.refunded ? 'refund_only' : 'refund_noop',
      })
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[healReversedStillPaid]', payment.id, err)
      results.push({ paymentId: payment.id, ok: false, reason: message.slice(0, 200) })
    }
  }

  return {
    scanned: candidates.length,
    healed: results.filter((r) => r.ok).length,
    results,
  }
}
