import { addOneHour, canManageReservation } from '../../utils/reservations'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{ coachId?: string; date?: string; startTime?: string }>(event)
  if (!body.coachId || !body.date || !body.startTime) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  const coach = await prisma.coach.findUnique({
    where: { id: body.coachId },
    include: { availability: true, club: true },
  })
  if (!coach) throw createError({ statusCode: 404, statusMessage: 'Coach not found' })
  if (!coach.isBookable) throw createError({ statusCode: 409, statusMessage: 'Coach is not bookable' })

  const dayOfWeek = new Date(`${body.date}T00:00:00`).getDay()
  const availability = coach.availability.find((item) =>
    item.dayOfWeek === dayOfWeek && item.startTime <= body.startTime! && item.endTime > body.startTime!,
  )
  if (!availability) {
    throw createError({ statusCode: 409, statusMessage: 'Coach is not available at this time' })
  }
  if (!canManageReservation(body.date, body.startTime, coach.club?.rescheduleWindowHours ?? 24)) {
    throw createError({ statusCode: 409, statusMessage: 'Start time is too soon' })
  }
  const existing = await prisma.coachSession.findFirst({
    where: { coachId: coach.id, date: body.date, startTime: body.startTime, status: { not: 'CANCELLED' } },
  })
  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'This session time is already booked' })
  }

  const session = await prisma.coachSession.create({
    data: {
      coachId: coach.id,
      athleteId: user.id,
      date: body.date,
      startTime: body.startTime,
      endTime: addOneHour(body.startTime),
      price: coach.sessionPrice,
      paymentStatus: 'PAY_AT_CLUB',
    },
  })
  await prisma.payment.create({
    data: {
      coachSessionId: session.id,
      amount: coach.sessionPrice,
      method: 'CASH',
      status: 'PAY_AT_CLUB',
    },
  })
  await prisma.reservationEvent.create({
    data: {
      coachSessionId: session.id,
      actorUserId: user.id,
      type: 'CREATED',
      metadataJson: JSON.stringify({ source: 'coach-booking' }),
    },
  })
  return session
})
