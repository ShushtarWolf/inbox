import { markCoachSessionNoShow } from '../../../utils/coachSessionNoShow'

export default defineEventHandler(async (event) => {
  assertCoachProductEnabled(event)
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const session = await prisma.coachSession.findFirst({
    where: {
      id,
      OR: [
        { athleteId: user.id },
        { coach: { userId: user.id } },
      ],
    },
    select: { id: true },
  })
  if (!session) throw createError({ statusCode: 404, statusMessage: 'Session not found' })

  const updated = await markCoachSessionNoShow({ sessionId: session.id, actorUserId: user.id })
  return { ok: true, noShowAt: updated.noShowAt }
})