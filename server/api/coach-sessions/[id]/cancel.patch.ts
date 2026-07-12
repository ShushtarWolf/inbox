import { canManageReservation } from '../../../utils/reservations'
import { cancelCoachSession } from '../../../utils/cancellations'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  const session = await prisma.coachSession.findFirst({
    where: { id, athleteId: user.id },
    include: { coach: { include: { club: true } }, payment: true },
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

  return cancelCoachSession({
    sessionId: id!,
    actorUserId: user.id,
    reason: 'athlete-cancel',
    paymentId: session.payment?.id,
    userId: session.athleteId,
  })
})
