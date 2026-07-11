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
    },
  })
  if (!pkg || pkg.club.status !== 'ACTIVE') {
    throw createError({ statusCode: 404, statusMessage: 'Package not found' })
  }
  if (pkg.bookings.length >= pkg.capacity) {
    throw createError({ statusCode: 409, statusMessage: 'Package is full' })
  }

  const price = Math.max(0, pkg.price - (pkg.discount || 0))
  const booking = await prisma.packageBooking.create({
    data: {
      packageId: pkg.id,
      athleteId: user.id,
      price,
      status: 'CONFIRMED',
      paymentStatus: 'PAY_AT_CLUB',
      daysJson: body.days?.length ? JSON.stringify(body.days) : pkg.daysJson,
      timesJson: body.times?.length ? JSON.stringify(body.times) : null,
    },
  })

  await prisma.payment.create({
    data: {
      packageBookingId: booking.id,
      amount: price,
      method: 'CASH',
      status: 'PAY_AT_CLUB',
    },
  })

  const athlete = await prisma.user.findUnique({ where: { id: user.id } })
  if (athlete?.email) {
    await sendNotification({
      channel: 'email',
      to: athlete.email,
      template: 'BOOKING_CONFIRMED',
      data: {
        kind: 'package',
        clubName: pkg.club.nameEn || pkg.club.nameFa,
        date: pkg.startDate || '',
        startTime: pkg.title,
      },
    })
  }

  return booking
})
