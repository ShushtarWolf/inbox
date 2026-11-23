import type { H3Event } from 'h3'
import { listOpenMatches } from '../../utils/openMatches'

async function optionalViewerUserId(event: H3Event) {
  const session = await getUserSession(event)
  return session?.user?.id
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const viewerUserId = await optionalViewerUserId(event)
  return listOpenMatches({
    sportId: typeof query.sportId === 'string' ? query.sportId : undefined,
    clubId: typeof query.clubId === 'string' ? query.clubId : undefined,
    city: typeof query.city === 'string' ? query.city : undefined,
    paymentMode: query.paymentMode === 'HOST_PAYS' || query.paymentMode === 'SPLIT_ONLINE'
      ? query.paymentMode
      : undefined,
    dateFrom: typeof query.dateFrom === 'string' ? query.dateFrom : undefined,
    dateTo: typeof query.dateTo === 'string' ? query.dateTo : undefined,
    viewerUserId,
  })
})