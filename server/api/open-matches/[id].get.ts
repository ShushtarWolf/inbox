import { getOpenMatchDetail } from '../../utils/openMatches'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const user = await getOptionalUser(event)
  return getOpenMatchDetail(id, user?.id)
})