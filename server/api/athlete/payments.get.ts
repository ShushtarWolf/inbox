import type { PaymentStatus } from '@prisma/client'
import { athleteListPrice, parseSeriesPaymentMeta } from '#shared/athleteSeason.ts'

/**
 * Athlete payment history — real Payment rows (IPG, cash desk, wallet, failed).
 * Sibling/covered rows store amount 0; expose per-line price for the UI.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const query = getQuery(event)
  const limit = Math.min(Math.max(Number(query.limit) || 40, 1), 100)

  const payments = await prisma.payment.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    where: {
      OR: [
        { booking: { userId: user.id } },
        { coachSession: { athleteId: user.id } },
        { packageBooking: { athleteId: user.id } },
        { purpose: 'topup', userId: user.id },
      ],
    },
    include: {
      booking: {
        select: {
          id: true,
          status: true,
          slot: {
            select: {
              date: true,
              startTime: true,
              price: true,
              court: {
                select: {
                  nameFa: true,
                  nameEn: true,
                  club: { select: { nameFa: true, nameEn: true, slug: true } },
                },
              },
            },
          },
        },
      },
      coachSession: {
        select: {
          id: true,
          status: true,
          date: true,
          startTime: true,
          price: true,
          coach: {
            select: {
              nameFa: true,
              nameEn: true,
              club: { select: { nameFa: true, nameEn: true, slug: true } },
            },
          },
        },
      },
      packageBooking: {
        select: {
          id: true,
          status: true,
          price: true,
          package: {
            select: {
              title: true,
              club: { select: { nameFa: true, nameEn: true, slug: true } },
            },
          },
        },
      },
    },
  })

  return {
    payments: payments.map((payment) => {
      const kind = payment.purpose === 'topup'
        ? 'topup'
        : payment.bookingId
          ? 'court'
          : payment.coachSessionId
            ? 'coach'
            : payment.packageBookingId
              ? 'package'
              : 'other'
      const club = payment.booking?.slot.court.club
        || payment.coachSession?.coach.club
        || payment.packageBooking?.package.club
        || null
      const title = payment.purpose === 'topup'
        ? null
        : payment.booking?.slot.court.nameFa
          || payment.coachSession?.coach.nameFa
          || payment.packageBooking?.package.title
          || null
      const date = payment.booking?.slot.date
        || payment.coachSession?.date
        || null
      const startTime = payment.booking?.slot.startTime
        || payment.coachSession?.startTime
        || null
      const listedPrice = payment.booking?.slot.price
        ?? payment.coachSession?.price
        ?? payment.packageBooking?.price
        ?? 0

      return {
        id: payment.id,
        amount: athleteListPrice({
          meta: parseSeriesPaymentMeta(payment.metadataJson),
          paymentAmount: payment.amount,
          slotPrice: listedPrice,
        }),
        method: payment.method,
        status: payment.status as PaymentStatus,
        provider: payment.provider,
        createdAt: payment.createdAt,
        kind,
        title,
        club,
        date,
        startTime,
        bookingId: payment.bookingId,
        bookingStatus: payment.booking?.status
          || payment.coachSession?.status
          || payment.packageBooking?.status
          || null,
      }
    }),
  }
})
