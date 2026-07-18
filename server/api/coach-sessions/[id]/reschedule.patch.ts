import { addOneHour, canManageReservation, assertSlotBookable } from '../../../utils/reservations'

export default defineEventHandler(async (event) => {
  assertCoachProductEnabled(event)
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody<{ date?: string; startTime?: string }>(event)
  if (!body.date || !body.startTime) throw createError({ statusCode: 400, statusMessage: 'date and startTime required' })

  const session = await prisma.coachSession.findFirst({
    where: { id, athleteId: user.id },
    include: { coach: { include: { availability: true, club: true } } },
  })
  if (!session) throw createError({ statusCode: 404, statusMessage: 'Session not found' })
  if (!canManageReservation(session.date, session.startTime, session.coach.club?.rescheduleWindowHours ?? 24)) {
    throw createError({ statusCode: 409, statusMessage: 'Reschedule window has passed' })
  }

  const dayOfWeek = new Date(`${body.date}T00:00:00`).getDay()
  const allowed = session.coach.availability.some((item) =>
    item.dayOfWeek === dayOfWeek && item.startTime <= body.startTime! && item.endTime > body.startTime!,
  )
  if (!allowed) throw createError({ statusCode: 409, statusMessage: 'Coach is not available at this time' })

  assertSlotBookable(body.date, body.startTime)
  if (!canManageReservation(body.date, body.startTime, session.coach.club?.rescheduleWindowHours ?? 24)) {
    throw createError({ statusCode: 409, statusMessage: 'BOOKING_TOO_SOON' })
  }

  const existing = await prisma.coachSession.findFirst({
    where: { coachId: session.coachId, date: body.date, startTime: body.startTime, status: { not: 'CANCELLED' }, id: { not: id } },
  })
  if (existing) throw createError({ statusCode: 409, statusMessage: 'This time is already booked' })

  await prisma.coachSession.update({
    where: { id },
    data: {
      date: body.date,
      startTime: body.startTime,
      endTime: addOneHour(body.startTime),
    },
  })
  await prisma.reservationEvent.create({
    data: {
      coachSessionId: id,
      actorUserId: user.id,
      type: 'RESCHEDULED',
      metadataJson: JSON.stringify({ date: body.date, startTime: body.startTime }),
    },
  })

  return { ok: true }
})
