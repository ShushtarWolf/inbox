export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'ATHLETE')
  const body = await readBody<{ bookingId?: string; rating?: number; body?: string; title?: string }>(event)
  const bookingId = body.bookingId
  const rating = body.rating
  const text = body.body?.trim()
  if (!bookingId || !rating || rating < 1 || rating > 5 || !text) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { slot: { include: { court: { include: { club: true } } } }, review: true },
  })
  if (!booking || booking.userId !== user.id) {
    throw createError({ statusCode: 404, statusMessage: 'Booking not found' })
  }
  if (booking.status !== 'CONFIRMED' || booking.review) {
    throw createError({ statusCode: 400, statusMessage: 'Not eligible for review' })
  }

  const club = booking.slot.court.club
  return prisma.review.create({
    data: {
      targetType: 'CLUB',
      clubId: club.id,
      bookingId: booking.id,
      authorUserId: user.id,
      authorName: user.name,
      rating,
      title: body.title?.trim(),
      body: text,
      isVerified: true,
    },
  })
})
