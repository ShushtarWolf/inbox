import { submitOpenMatchResult } from '../../../utils/openMatches'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const body = await readBody<{ score?: Record<string, unknown>, opponentUserId?: string }>(event)
  if (!body.score) throw createError({ statusCode: 400, statusMessage: 'score required' })
  return submitOpenMatchResult({
    openMatchId: id,
    userId: user.id,
    score: body.score,
    opponentUserId: body.opponentUserId,
  })
})