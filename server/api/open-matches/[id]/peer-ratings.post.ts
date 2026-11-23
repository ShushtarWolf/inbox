import { submitOpenMatchPeerRatings } from '../../../utils/openMatches'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const body = await readBody<{
    ratings?: Array<{ toUserId: string, perceivedLevel: number, fairPlayScore: number, note?: string }>
  }>(event)
  if (!body.ratings?.length) throw createError({ statusCode: 400, statusMessage: 'ratings required' })
  return submitOpenMatchPeerRatings({
    openMatchId: id,
    fromUserId: user.id,
    ratings: body.ratings,
  })
})