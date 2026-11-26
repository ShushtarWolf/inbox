import { resolveCancelMoneyDetail } from '#shared/cancelPolicy.ts'
import { cancelCoachSession } from '../../../../utils/cancellations'

/** Admin secret: cancel any coach session (court-linked sessions unwind court + refunds per policy). */
export default defineEventHandler(async (event) => {
  assertCoachProductEnabled(event)
  requireAdminSecret(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const session = await prisma.coachSession.findUnique({
    where: { id },
    include: { payment: true, coach: { include: { club: true } } },
  })
  if (!session) throw createError({ statusCode: 404, statusMessage: 'Session not found' })
  if (session.status === 'CANCELLED') return { ok: true }

  const hostClub = session.coach.club
  const windowHours = hostClub?.cancellationWindowHours ?? 12
  const { outcome: moneyOutcome, refundBps } = resolveCancelMoneyDetail({
    actor: 'owner',
    date: session.date,
    startTime: session.startTime,
    windowHours,
  })

  const result = await cancelCoachSession({
    sessionId: session.id,
    actorUserId: undefined,
    reason: 'admin-cancel-coach-session',
    paymentId: session.payment?.id,
    userId: session.athleteId,
    moneyOutcome,
  })

  return { ...result, moneyOutcome, refundBps }
})