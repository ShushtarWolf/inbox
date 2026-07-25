import type { PaymentStatus } from '@prisma/client'

const PAYMENT_STATUSES: PaymentStatus[] = [
  'PAY_AT_CLUB',
  'PENDING_AT_CLUB',
  'PENDING_ONLINE',
  'PAID',
  'FAILED',
  'REFUNDED',
]

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const query = getQuery(event)
  const limit = Math.min(Number(query.limit) || 50, 100)
  const status = typeof query.status === 'string' ? query.status : undefined
  const q = typeof query.q === 'string' ? query.q.trim() : ''

  const payments = await prisma.payment.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    where: {
      ...(status && PAYMENT_STATUSES.includes(status as PaymentStatus)
        ? { status: status as PaymentStatus }
        : {}),
      ...(q
        ? {
            OR: [
              { booking: { user: { email: { contains: q, mode: 'insensitive' } } } },
              { booking: { user: { name: { contains: q, mode: 'insensitive' } } } },
              { booking: { guestName: { contains: q, mode: 'insensitive' } } },
              { booking: { guestMobile: { contains: q } } },
              {
                booking: {
                  slot: { court: { club: { nameFa: { contains: q, mode: 'insensitive' } } } },
                },
              },
              {
                booking: {
                  slot: { court: { club: { slug: { contains: q, mode: 'insensitive' } } } },
                },
              },
            ],
          }
        : {}),
    },
    include: {
      booking: {
        select: {
          id: true,
          status: true,
          guestName: true,
          guestMobile: true,
          user: { select: { id: true, email: true, name: true } },
          slot: {
            select: {
              date: true,
              startTime: true,
              court: {
                select: {
                  nameFa: true,
                  club: { select: { id: true, nameFa: true, slug: true } },
                },
              },
            },
          },
        },
      },
    },
  })

  return {
    payments: payments.map((payment) => ({
      id: payment.id,
      amount: payment.amount,
      method: payment.method,
      status: payment.status,
      provider: payment.provider,
      createdAt: payment.createdAt,
      bookingId: payment.bookingId,
      club: payment.booking?.slot.court.club || null,
      user: payment.booking?.user || null,
      guestName: payment.booking?.guestName || null,
      guestMobile: payment.booking?.guestMobile || null,
      bookingStatus: payment.booking?.status || null,
      courtNameFa: payment.booking?.slot.court.nameFa || null,
      date: payment.booking?.slot.date || null,
      startTime: payment.booking?.slot.startTime || null,
    })),
  }
})
