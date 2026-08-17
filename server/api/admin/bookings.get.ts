import type { BookingStatus, PaymentStatus, Prisma } from '@prisma/client'
import { bookingPaymentChannelWhere, isPaymentChannel } from '#shared/bookingPayment.ts'

const BOOKING_STATUSES: BookingStatus[] = ['PENDING', 'CONFIRMED', 'CANCELLED']
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
  const paymentStatus = typeof query.paymentStatus === 'string' ? query.paymentStatus : undefined
  const paymentChannel = typeof query.paymentChannel === 'string' ? query.paymentChannel : undefined
  const q = typeof query.q === 'string' ? query.q.trim() : ''

  const whereAnd: Prisma.BookingWhereInput[] = []
  if (status && BOOKING_STATUSES.includes(status as BookingStatus)) {
    whereAnd.push({ status: status as BookingStatus })
  }
  if (paymentStatus && PAYMENT_STATUSES.includes(paymentStatus as PaymentStatus)) {
    whereAnd.push({ paymentStatus: paymentStatus as PaymentStatus })
  }
  const channelWhere = isPaymentChannel(paymentChannel)
    ? bookingPaymentChannelWhere(paymentChannel)
    : null
  if (channelWhere) whereAnd.push(channelWhere)
  if (q) {
    whereAnd.push({
      OR: [
        { guestName: { contains: q, mode: 'insensitive' } },
        { guestMobile: { contains: q } },
        { user: { email: { contains: q, mode: 'insensitive' } } },
        { user: { name: { contains: q, mode: 'insensitive' } } },
        { slot: { court: { club: { nameFa: { contains: q, mode: 'insensitive' } } } } },
        { slot: { court: { club: { nameEn: { contains: q, mode: 'insensitive' } } } } },
        { slot: { court: { club: { slug: { contains: q, mode: 'insensitive' } } } } },
        { slot: { court: { club: { city: { contains: q, mode: 'insensitive' } } } } },
      ],
    })
  }

  const bookings = await prisma.booking.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    where: whereAnd.length ? { AND: whereAnd } : undefined,
    include: {
      user: { select: { id: true, email: true, name: true } },
      payment: { select: { id: true, amount: true, status: true, method: true } },
      slot: {
        include: {
          court: {
            include: {
              club: { select: { id: true, nameFa: true, nameEn: true, slug: true, city: true } },
            },
          },
        },
      },
    },
  })

  return {
    bookings: bookings.map((booking) => ({
      id: booking.id,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      paymentMethod: booking.paymentMethod,
      source: booking.source,
      createdAt: booking.createdAt,
      guestName: booking.guestName,
      guestMobile: booking.guestMobile,
      user: booking.user,
      payment: booking.payment,
      club: booking.slot.court.club,
      courtNameFa: booking.slot.court.nameFa,
      date: booking.slot.date,
      startTime: booking.slot.startTime,
    })),
  }
})
