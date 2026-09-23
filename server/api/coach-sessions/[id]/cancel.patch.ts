import { notifyBookingCancelled } from '../../../utils/bookingNotify'
import { cancelCoachSession } from '../../../utils/cancellations'
import { canManageReservation } from '../../../utils/reservations'

export default defineEventHandler(async (event) => {
  assertCoachProductEnabled(event)
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  const session = await prisma.coachSession.findFirst({
    where: {
      id,
      OR: [
        { athleteId: user.id },
        { coach: { userId: user.id } },
      ],
    },
    include: {
      coach: { include: { club: true, user: true } },
      payment: true,
      athlete: true,
      courtBooking: { include: { slot: { include: { court: { include: { club: true } } } } } },
    },
  })
  if (!session) throw createError({ statusCode: 404, statusMessage: 'Session not found' })
  if (session.status === 'CANCELLED') return { ok: true }

  const isCoachActor = session.coach.userId === user.id
  const hostClub = session.courtBooking?.slot.court.club || session.coach.club
  if (!canManageReservation(session.date, session.startTime, hostClub?.cancellationWindowHours ?? 24)) {
    throw createError({ statusCode: 409, statusMessage: 'Cancellation window has passed' })
  }

  const reason = isCoachActor ? 'coach-cancel' : 'athlete-cancel'
  const result = await cancelCoachSession({
    sessionId: id!,
    actorUserId: user.id,
    reason,
    paymentId: session.payment?.id,
    userId: session.athleteId,
  })

  await notifyBookingCancelled({
    userId: session.athleteId,
    email: session.athlete.email,
    phone: session.athlete.phone,
    kind: 'coach',
    clubName: hostClub?.nameEn || hostClub?.nameFa || session.coach.nameEn || session.coach.nameFa,
    clubId: hostClub?.id || undefined,
    bookingId: session.id,
    date: session.date,
    startTime: session.startTime,
    reason,
  })

  if (!isCoachActor && session.courtBooking) {
    await notifyBookingCancelled({
      userId: session.coach.userId,
      email: session.coach.user?.email,
      phone: session.coach.user?.phone,
      kind: 'coach',
      clubName: hostClub?.nameFa || hostClub?.nameEn || '',
      clubId: hostClub?.id || undefined,
      bookingId: session.id,
      date: session.date,
      startTime: session.startTime,
      reason,
    })
  }

  return result
})
