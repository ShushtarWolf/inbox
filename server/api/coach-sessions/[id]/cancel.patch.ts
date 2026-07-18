import { notifyBookingCancelled } from '../../../utils/bookingNotify'
import { cancelCoachSession } from '../../../utils/cancellations'
import { canManageReservation } from '../../../utils/reservations'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  const session = await prisma.coachSession.findFirst({
    where: { id, athleteId: user.id },
    include: { coach: { include: { club: true } }, payment: true, athlete: true },
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

  const result = await cancelCoachSession({
    sessionId: id!,
    actorUserId: user.id,
    reason: 'athlete-cancel',
    paymentId: session.payment?.id,
    userId: session.athleteId,
  })

  await notifyBookingCancelled({
    userId: user.id,
    email: session.athlete?.email,
    phone: session.athlete?.phone,
    kind: 'coach',
    clubName: session.coach.club?.nameEn || session.coach.club?.nameFa || session.coach.nameEn || session.coach.nameFa,
    clubId: session.coach.clubId || undefined,
    bookingId: session.id,
    date: session.date,
    startTime: session.startTime,
    reason: 'athlete-cancel',
  })

  return result
})
