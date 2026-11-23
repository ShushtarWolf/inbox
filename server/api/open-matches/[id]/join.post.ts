import { joinOpenMatch } from '../../../utils/openMatches'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  return joinOpenMatch({ openMatchId: id, userId: user.id })
})