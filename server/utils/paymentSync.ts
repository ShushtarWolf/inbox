import type { Prisma } from '@prisma/client'
import { resolveParentPaymentMethod } from '#shared/bookingPayment.ts'
import { notifyBookingPaid } from './bookingNotify'
import { getPaymentService } from './payments/service'

type DbClient = Prisma.TransactionClient | typeof prisma

export async function syncPaymentToParent(paymentId: string, db: DbClient = prisma) {
  const payment = await db.payment.findUnique({ where: { id: paymentId } })
  if (!payment) return

  const paymentMethod = resolveParentPaymentMethod(payment.method, payment.status)

  if (payment.bookingId) {
    await db.booking.update({
      where: { id: payment.bookingId },
      data: {
        paymentStatus: payment.status,
        ...(paymentMethod ? { paymentMethod } : {}),
      },
    })
  }

  if (payment.coachSessionId) {
    await db.coachSession.update({
      where: { id: payment.coachSessionId },
      data: { paymentStatus: payment.status },
    })
  }

  if (payment.packageBookingId) {
    await db.packageBooking.update({
      where: { id: payment.packageBookingId },
      data: { paymentStatus: payment.status },
    })
  }
}

async function notifyPaidIfNeeded(paymentId: string, previousStatus: string) {
  if (previousStatus === 'PAID') return
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      booking: {
        include: {
          user: true,
          slot: { include: { court: { include: { club: true } } } },
        },
      },
      coachSession: {
        include: {
          athlete: true,
          coach: { include: { club: true } },
        },
      },
      packageBooking: {
        include: {
          athlete: true,
          package: { include: { club: true } },
        },
      },
    },
  })
  if (!payment || payment.status !== 'PAID') return

  try {
    if (payment.booking) {
      const b = payment.booking
      await notifyBookingPaid({
        userId: b.userId,
        email: b.user?.email,
        phone: b.user?.phone || b.guestMobile,
        kind: 'court',
        clubName: b.slot.court.club.nameEn || b.slot.court.club.nameFa,
        clubId: b.slot.court.clubId,
        bookingId: b.id,
        date: b.slot.date,
        startTime: b.slot.startTime,
      })
      return
    }
    if (payment.coachSession) {
      const s = payment.coachSession
      await notifyBookingPaid({
        userId: s.athleteId,
        email: s.athlete?.email,
        phone: s.athlete?.phone,
        kind: 'coach',
        clubName: s.coach.club?.nameEn || s.coach.club?.nameFa || 'Club',
        clubId: s.coach.clubId,
        bookingId: s.id,
        date: s.date,
        startTime: s.startTime,
      })
      return
    }
    if (payment.packageBooking) {
      const p = payment.packageBooking
      await notifyBookingPaid({
        userId: p.athleteId,
        email: p.athlete?.email,
        phone: p.athlete?.phone,
        kind: 'package',
        clubName: p.package.club.nameEn || p.package.club.nameFa,
        clubId: p.package.clubId,
        bookingId: p.id,
        date: '',
        startTime: '',
      })
    }
  } catch (err) {
    console.error('[paymentSync:notifyPaid]', paymentId, err)
  }
}

export async function confirmPaymentAndSync(
  providerRef: string,
  providerName?: string,
  opts?: { refNum?: string },
) {
  const before = await prisma.payment.findFirst({
    where: {
      providerRef,
      ...(providerName ? { provider: providerName } : {}),
    },
  })
  const previousStatus = before?.status || ''

  const service = getPaymentService(providerName)
  const intent = await service.confirm(providerRef, opts)
  await syncPaymentToParent(intent.id)
  if (intent.status === 'PAID') {
    await notifyPaidIfNeeded(intent.id, previousStatus)
  }
  return intent
}

/** Mark payment FAILED (user cancel / bank decline / verify failure). Idempotent. */
export async function markPaymentFailedAndSync(providerRef: string, providerName?: string) {
  const payment = await prisma.payment.findFirst({
    where: {
      providerRef,
      ...(providerName ? { provider: providerName } : {}),
    },
  })
  if (!payment) return null
  if (payment.status === 'PAID' || payment.status === 'REFUNDED') {
    // Never downgrade a settled payment from a late NOK callback.
    return toSafeIntent(payment)
  }
  if (payment.status === 'FAILED') {
    return toSafeIntent(payment)
  }
  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: { status: 'FAILED' },
  })
  await syncPaymentToParent(updated.id)
  return toSafeIntent(updated)
}

function toSafeIntent(payment: { id: string; amount: number; status: string; provider: string; providerRef: string | null }) {
  return {
    id: payment.id,
    amount: payment.amount,
    status: payment.status,
    provider: payment.provider,
    providerRef: payment.providerRef,
  }
}
