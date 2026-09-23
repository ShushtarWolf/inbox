import { addOneHour, canManageReservation, assertSlotBookable } from '../../../utils/reservations'

export default defineEventHandler(async (event) => {
  assertCoachProductEnabled(event)
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody<{ date?: string; startTime?: string }>(event)
  if (!body.date || !body.startTime) {
    throw createError({ statusCode: 400, statusMessage: 'date and startTime required' })
  }

  const session = await prisma.coachSession.findFirst({
    where: {
      id,
      OR: [
        { athleteId: user.id },
        { coach: { userId: user.id } },
      ],
    },
    include: {
      coach: { include: { availability: true, club: true } },
      courtBooking: { include: { slot: { include: { court: { include: { club: true } } } } } },
    },
  })
  if (!session) throw createError({ statusCode: 404, statusMessage: 'Session not found' })
  if (session.status === 'CANCELLED') throw createError({ statusCode: 409, statusMessage: 'Session is cancelled' })

  const isCoachActor = session.coach.userId === user.id
  const hostClub = session.courtBooking?.slot.court.club || session.coach.club
  const rescheduleWindow = hostClub?.rescheduleWindowHours ?? 24
  if (!canManageReservation(session.date, session.startTime, rescheduleWindow)) {
    throw createError({ statusCode: 409, statusMessage: 'Reschedule window has passed' })
  }

  const dayOfWeek = new Date(`${body.date}T00:00:00`).getDay()
  const allowed = session.coach.availability.some((item) =>
    item.dayOfWeek === dayOfWeek && item.startTime <= body.startTime! && item.endTime > body.startTime!,
  )
  if (!allowed) throw createError({ statusCode: 409, statusMessage: 'Coach is not available at this time' })
  assertSlotBookable(body.date, body.startTime)
  if (!canManageReservation(body.date, body.startTime, rescheduleWindow)) {
    throw createError({ statusCode: 409, statusMessage: 'BOOKING_TOO_SOON' })
  }

  const oldSlot = session.courtBooking?.slot
  let targetSlot = null as Awaited<ReturnType<typeof prisma.slot.findFirst>>
  if (oldSlot) {
    targetSlot = await prisma.slot.findFirst({
      where: { courtId: oldSlot.courtId, date: body.date, startTime: body.startTime },
    })
    if (!targetSlot) throw createError({ statusCode: 409, statusMessage: 'Court slot is not available' })
    if (targetSlot.id !== oldSlot.id && targetSlot.displayStatus !== 'FREE') {
      throw createError({ statusCode: 409, statusMessage: 'This time is already booked' })
    }
    if (targetSlot.id !== oldSlot.id && targetSlot.price !== oldSlot.price) {
      throw createError({ statusCode: 409, statusMessage: 'Rescheduling to a different court price is not supported' })
    }
  } else {
    const existing = await prisma.coachSession.findFirst({
      where: { coachId: session.coachId, date: body.date, startTime: body.startTime, status: { not: 'CANCELLED' }, id: { not: id } },
    })
    if (existing) throw createError({ statusCode: 409, statusMessage: 'This time is already booked' })
  }

  await prisma.$transaction(async (tx) => {
    if (oldSlot && targetSlot && targetSlot.id !== oldSlot.id) {
      const claimed = await tx.slot.updateMany({
        where: { id: targetSlot.id, displayStatus: 'FREE' },
        data: { displayStatus: 'RESERVED' },
      })
      if (claimed.count !== 1) throw createError({ statusCode: 409, statusMessage: 'This time is already booked' })
      await tx.booking.update({ where: { id: session.courtBooking!.id }, data: { slotId: targetSlot.id } })
      await tx.slot.update({ where: { id: oldSlot.id }, data: { displayStatus: 'FREE' } })
    }

    await tx.coachSession.update({
      where: { id },
      data: {
        date: body.date!,
        startTime: body.startTime!,
        endTime: targetSlot?.endTime || addOneHour(body.startTime!),
      },
    })
    await tx.reservationEvent.create({
      data: {
        coachSessionId: id!,
        actorUserId: user.id,
        type: 'RESCHEDULED',
        metadataJson: JSON.stringify({ date: body.date, startTime: body.startTime, actor: isCoachActor ? 'coach' : 'athlete' }),
      },
    })
  })

  return { ok: true, date: body.date, startTime: body.startTime, endTime: targetSlot?.endTime || addOneHour(body.startTime) }
})
