import { resolveCancelMoneyDetail } from '#shared/cancelPolicy.ts'
import { cancelCoachSession } from '../../../../utils/cancellations'
import { notifyBookingCancelled, clubNotifyName, personNotifyName } from '../../../../utils/bookingNotify'

/** Owner cancels a coach marketplace or lesson session at this club (full refund policy). */
export default defineEventHandler(async (event) => {
  assertCoachProductEnabled(event)
  const { club, user } = await requireOwnerClub(event, 'calendar')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const session = await prisma.coachSession.findFirst({
    where: {
      id,
      OR: [
        { coach: { clubId: club.id } },
        { courtBooking: { slot: { court: { clubId: club.id } } } },
      ],
    },
    include: {
      payment: true,
      athlete: true,
      coach: { include: { club: true, user: true } },
      courtBooking: { include: { slot: { include: { court: { include: { club: true } } } } } },
    },
  })
  if (!session) throw createError({ statusCode: 404, statusMessage: 'Session not found' })
  if (session.status === 'CANCELLED') return { ok: true }

  const hostClub = session.courtBooking?.slot.court.club || session.coach.club || club
  const windowHours = hostClub?.cancellationWindowHours ?? 12
  const { outcome: moneyOutcome, refundBps } = resolveCancelMoneyDetail({
    actor: 'owner',
    date: session.date,
    startTime: session.startTime,
    windowHours,
  })

  const reason = 'owner-cancel-coach-session'
  const result = await cancelCoachSession({
    sessionId: session.id,
    actorUserId: user.id,
    reason,
    paymentId: session.payment?.id,
    userId: session.athleteId,
    moneyOutcome,
    // Court-linked sessions unwind the court booking; court-less sessions cancel session only.
  })

  await notifyBookingCancelled({
    userId: session.athleteId,
    email: session.athlete.email,
    phone: session.athlete.phone,
    kind: 'coach',
    clubName: clubNotifyName(hostClub || { nameFa: session.coach.nameFa, nameEn: session.coach.nameEn }),
    clubId: hostClub?.id,
    bookingId: session.id,
    date: session.date,
    startTime: session.startTime,
    reason,
    guestName: personNotifyName(session.athlete.name, session.athlete.nameFamily),
  })

  return { ...result, moneyOutcome, refundBps }
})