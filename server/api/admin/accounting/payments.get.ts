import {
  isAccountingPaymentBucket,
  paymentRowAccountingBucketWhere,
} from '#shared/bookingPayment.ts'
import { adminPaymentCreatedAtFilter, parseAdminDateBound } from '../../../utils/adminDateRange'
import { requireAdminSecret } from '../../../utils/adminAuth'

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const query = getQuery(event)
  const bucketRaw = typeof query.bucket === 'string' ? query.bucket : undefined
  if (!isAccountingPaymentBucket(bucketRaw)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid bucket' })
  }

  const from = parseAdminDateBound(query.from, false)
  const to = parseAdminDateBound(query.to, true)
  const createdAtFilter = adminPaymentCreatedAtFilter(from, to)
  const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 200)

  const bucketWhere = paymentRowAccountingBucketWhere(bucketRaw)
  if (!bucketWhere) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid bucket' })
  }

  const payments = await prisma.payment.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    where: {
      status: 'PAID',
      ...bucketWhere,
      ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
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

  const total = await prisma.payment.count({
    where: {
      status: 'PAID',
      ...bucketWhere,
      ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
    },
  })

  return {
    bucket: bucketRaw,
    range: {
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
    },
    total,
    limit,
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
