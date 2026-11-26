import { markCoachSessionNoShow } from '../../../../utils/coachSessionNoShow'

export default defineEventHandler(async (event) => {
  assertCoachProductEnabled(event)
  requireAdminSecret(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const session = await prisma.coachSession.findUnique({ where: { id }, select: { id: true } })
  if (!session) throw createError({ statusCode: 404, statusMessage: 'Session not found' })

  const updated = await markCoachSessionNoShow({
    sessionId: session.id,
    actorUserId: 'admin-secret',
  })
  return { ok: true, noShowAt: updated.noShowAt }
})