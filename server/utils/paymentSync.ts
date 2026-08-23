import type { Prisma } from '@prisma/client'
import { resolveParentPaymentMethod } from '#shared/bookingPayment.ts'
import { normalizeIranPhone } from '#shared/phone.ts'
import {
  clubNotifyName,
  courtNotifyName,
  notifyBookingPaid,
  notifyOwnerBookingPaid,
  ownerNotifyPhone,
  personNotifyName,
} from './bookingNotify'
import { notifyAdminWalletTopUp } from './adminNotify'
import { getPaymentService } from './payments/service'
import { promoteOnlineHoldOnPaid } from './onlinePaymentHold'
import { creditOwnerForPaidPayment } from './settlement'
import { creditWalletForTopUpPayment } from './wallet'

type DbClient = Prisma.TransactionClient | typeof prisma

function parsePaymentMetadata(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

/** Mark abandoned top-up intents FAILED so payment history stays consistent. */
export async function supersedePendingTopUpPayments(userId: string, db: DbClient = prisma) {
  const pending = await db.payment.findMany({
    where: {
      userId,
      purpose: 'topup',
      status: 'PENDING_ONLINE',
    },
    select: { id: true, metadataJson: true },
  })

  for (const payment of pending) {
    const credited = await db.walletTransaction.findFirst({
      where: { paymentId: payment.id, type: 'TOPUP_CREDIT' },
    })
    if (credited) continue

    const meta = parsePaymentMetadata(payment.metadataJson)
    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: 'FAILED',
        metadataJson: JSON.stringify({
          ...meta,
          superseded: true,
          supersededAt: new Date().toISOString(),
        }),
      },
    })
  }
}

export async function syncPaymentToParent(paymentId: string, db: DbClient = prisma) {
  const payment = await db.payment.findUnique({ where: { id: paymentId } })
  if (!payment) return

  // Top-up has no booking/coach/package parent.
  if (payment.purpose === 'topup') return

  const paymentMethod = resolveParentPaymentMethod(payment.method, payment.status)

  if (payment.bookingId) {
    const booking = await db.booking.findUnique({ where: { id: payment.bookingId } })
    // Expired/cancelled holds must not be revived by a late PAID sync.
    if (booking?.status === 'CANCELLED') return

    await db.booking.update({
      where: { id: payment.bookingId },
      data: {
        paymentStatus: payment.status,
        ...(paymentMethod ? { paymentMethod } : {}),
      },
    })

    if (payment.status === 'PAID') {
      await promoteOnlineHoldOnPaid(payment.bookingId, db)
    }

    // Multi-slot group: when the primary (combined) payment settles, mirror status onto siblings.
    if (payment.metadataJson && payment.status === 'PAID') {
      try {
        const meta = JSON.parse(payment.metadataJson) as { groupSiblingBookingIds?: string[] }
        const siblingIds = meta.groupSiblingBookingIds || []
        for (const siblingId of siblingIds) {
          await db.booking.update({
            where: { id: siblingId },
            data: {
              paymentStatus: 'PAID',
              ...(paymentMethod ? { paymentMethod } : {}),
            },
          })
          await db.payment.updateMany({
            where: { bookingId: siblingId },
            data: { status: 'PAID', method: payment.method },
          })
        }
      }
      catch {
        // ignore malformed metadata
      }
    }
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
          slot: {
            include: {
              court: {
                include: {
                  club: { include: { owner: true } },
                },
              },
            },
          },
        },
      },
      coachSession: {
        include: {
          athlete: true,
          coach: { include: { club: { include: { owner: true } } } },
        },
      },
      packageBooking: {
        include: {
          athlete: true,
          package: { include: { club: { include: { owner: true } } } },
        },
      },
    },
  })
  if (!payment || payment.status !== 'PAID') return

  try {
    if (payment.booking) {
      const b = payment.booking
      const club = b.slot.court.club
      const rawGuest = b.guestMobile
      const phone = b.user?.phone || (rawGuest ? normalizeIranPhone(rawGuest) || rawGuest : null)
      const guestName = personNotifyName(b.guestName, b.guestFamily) || b.user?.name || ''
      const courtName = courtNotifyName(b.slot.court)
      const clubName = clubNotifyName(club)
      await notifyBookingPaid({
        userId: b.userId,
        email: b.user?.email,
        phone,
        kind: 'court',
        clubName,
        clubId: club.id,
        bookingId: b.id,
        date: b.slot.date,
        startTime: b.slot.startTime,
        endTime: b.slot.endTime,
        courtName,
        paymentPaid: true,
        guestName,
        amountPaid: payment.amount,
      })
      await notifyOwnerBookingPaid({
        ownerPhone: ownerNotifyPhone(club),
        clubName,
        clubId: club.id,
        bookingId: b.id,
        date: b.slot.date,
        startTime: b.slot.startTime,
        endTime: b.slot.endTime,
        courtName,
        guestName,
        guestPhone: phone,
        amountPaid: payment.amount,
      })
      return
    }
    if (payment.coachSession) {
      const s = payment.coachSession
      const club = s.coach.club || {}
      const clubName = clubNotifyName(club)
      const clubId = s.coach.clubId || undefined
      await notifyBookingPaid({
        userId: s.athleteId,
        email: s.athlete?.email,
        phone: s.athlete?.phone,
        kind: 'coach',
        clubName,
        clubId,
        bookingId: s.id,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        guestName: s.athlete?.name,
        amountPaid: payment.amount,
        paymentPaid: true,
      })
      if (s.coach.club) {
        await notifyOwnerBookingPaid({
          ownerPhone: ownerNotifyPhone(s.coach.club),
          clubName,
          clubId,
          bookingId: s.id,
          date: s.date,
          startTime: s.startTime,
          endTime: s.endTime,
          guestName: s.athlete?.name,
          guestPhone: s.athlete?.phone,
          amountPaid: payment.amount,
        })
      }
      return
    }
    if (payment.packageBooking) {
      const p = payment.packageBooking
      const club = p.package.club
      const clubName = clubNotifyName(club)
      await notifyBookingPaid({
        userId: p.athleteId,
        email: p.athlete?.email,
        phone: p.athlete?.phone,
        kind: 'package',
        clubName,
        clubId: p.package.clubId,
        bookingId: p.id,
        date: '',
        startTime: '',
        guestName: p.athlete?.name,
        amountPaid: payment.amount,
        paymentPaid: true,
      })
      await notifyOwnerBookingPaid({
        ownerPhone: ownerNotifyPhone(club),
        clubName,
        clubId: p.package.clubId,
        bookingId: p.id,
        date: '',
        startTime: '',
        guestName: p.athlete?.name,
        guestPhone: p.athlete?.phone,
        amountPaid: payment.amount,
      })
    }
  } catch (err) {
    console.error('[paymentSync:notifyPaid]', paymentId, err)
  }
}

/** Notify athlete/guest when a payment newly becomes PAID (wallet checkout, online callback, etc.). */
export async function notifyPaymentPaidIfNeeded(paymentId: string, previousStatus: string) {
  return notifyPaidIfNeeded(paymentId, previousStatus)
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
    include: { booking: { select: { id: true, status: true } } },
  })
  const previousStatus = before?.status || ''

  // Hold already released — do not confirm/credit against a cancelled booking.
  if (before?.booking?.status === 'CANCELLED') {
    if (before.status !== 'PAID' && before.status !== 'REFUNDED' && before.status !== 'FAILED') {
      await prisma.payment.update({
        where: { id: before.id },
        data: { status: 'FAILED' },
      })
      await syncPaymentToParent(before.id)
    }
    return {
      id: before.id,
      amount: before.amount,
      status: 'FAILED' as const,
      provider: before.provider,
      providerRef: before.providerRef,
    }
  }

  const service = getPaymentService(providerName)
  const intent = await service.confirm(providerRef, opts)
  await syncPaymentToParent(intent.id)
  if (intent.status === 'PAID') {
    await creditWalletForTopUpPayment(intent.id, previousStatus)
    await creditOwnerForPaidPayment(intent.id, previousStatus)
    await notifyPaidIfNeeded(intent.id, previousStatus)
    if (before?.purpose === 'topup' && previousStatus !== 'PAID') {
      try {
        const user = before.userId
          ? await prisma.user.findUnique({
              where: { id: before.userId },
              select: { name: true, phone: true },
            })
          : null
        await notifyAdminWalletTopUp({
          amount: intent.amount,
          userName: user?.name,
          userPhone: user?.phone,
          paymentId: intent.id,
        })
      } catch (err) {
        console.error('[paymentSync:adminTopUpSms]', intent.id, err)
      }
    }
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

function toSafeIntent(payment: {
  id: string
  amount: number
  status: string
  provider: string
  providerRef: string | null
}) {
  return {
    id: payment.id,
    amount: payment.amount,
    status: payment.status,
    provider: payment.provider,
    providerRef: payment.providerRef,
  }
}
