import { canManageReservation } from '../../../utils/reservations'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  const session = await prisma.coachSession.findFirst({
    where: { id, athleteId: user.id },
    include: { coach: { include: { club: true } } },
  })

  if (!session) {
    throw createError({ statusCode: 404, statusMessage: 'Session not found' })
  }

  if (session.status === 'CANCELLED') {
    return { ok: true }
  }

  if (!canManageReservation(session.date, session.startTime, session.coach.club?.cancellationWindowHours ?? 24)) {
    throw createError({ statusCode: 409, statusMessage: 'Cancellation window has passed' })
  }

  await prisma.$transaction(async (tx) => {
    await tx.coachSession.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    })
    await tx.reservationEvent.create({
      data: {
        coachSessionId: id,
        actorUserId: user.id,
        type: 'CANCELLED',
        metadataJson: JSON.stringify({ reason: 'athlete-cancel' }),
      },
    })
  })

  return { ok: true }
})
