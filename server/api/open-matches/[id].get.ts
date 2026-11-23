import type { H3Event } from 'h3'
import { getOpenMatchDetail } from '../../utils/openMatches'

async function optionalViewerUserId(event: H3Event) {
  const session = await getUserSession(event)
  return session?.user?.id
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const viewerUserId = await optionalViewerUserId(event)
  return getOpenMatchDetail(id, viewerUserId)
})