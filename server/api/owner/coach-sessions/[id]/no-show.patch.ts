import { markCoachSessionNoShow } from '../../../../utils/coachSessionNoShow'

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
    select: { id: true },
  })
  if (!session) throw createError({ statusCode: 404, statusMessage: 'Session not found' })

  const updated = await markCoachSessionNoShow({ sessionId: session.id, actorUserId: user.id })
  return { ok: true, noShowAt: updated.noShowAt }
})