import { initialPlatformPaymentFields } from '#shared/bookingPayment.ts'
import { notifyBookingConfirmed } from '../../utils/bookingNotify'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{ packageId?: string; days?: string[]; times?: string[] }>(event)
  if (!body.packageId) {
    throw createError({ statusCode: 400, statusMessage: 'packageId required' })
  }

  const pkg = await prisma.packageDraft.findUnique({
    where: { id: body.packageId },
    include: {
      club: true,
      coach: true,
      bookings: { where: { status: { not: 'CANCELLED' } }, select: { id: true } },
      players: { select: { id: true } },
    },
  })
  if (!pkg || pkg.club.status !== 'ACTIVE') {
    throw createError({ statusCode: 404, statusMessage: 'Package not found' })
  }
  if (pkg.bookings.length + pkg.players.length >= pkg.capacity) {
    throw createError({ statusCode: 409, statusMessage: 'Package is full' })
  }

  const price = Math.max(0, pkg.price - (pkg.discount || 0))
  const paymentFields = initialPlatformPaymentFields(price)
  const booking = await prisma.packageBooking.create({
    data: {
      packageId: pkg.id,
      athleteId: user.id,
      price,
      status: 'CONFIRMED',
      paymentStatus: paymentFields.paymentStatus,
      daysJson: body.days?.length ? JSON.stringify(body.days) : pkg.daysJson,
      timesJson: body.times?.length ? JSON.stringify(body.times) : null,
    },
  })

  await prisma.payment.create({
    data: {
      packageBookingId: booking.id,
      ...paymentFields.payment,
    },
  })

  const athlete = await prisma.user.findUnique({ where: { id: user.id } })
  await notifyBookingConfirmed({
    userId: user.id,
    email: athlete?.email,
    kind: 'package',
    clubName: pkg.club.nameEn || pkg.club.nameFa,
    clubId: pkg.clubId,
    bookingId: booking.id,
    date: pkg.startDate || '',
    startTime: pkg.title,
  })

  return booking
})
