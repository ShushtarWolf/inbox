import { buildCalendarSourcesResponse } from '../../lib/calendarSources'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const query = getQuery(event)
  const date = (typeof query.date === 'string' && query.date) ? query.date : todayDateStr()

  return buildCalendarSourcesResponse({
    clubId: club.id,
    clubSlug: club.slug,
    date,
  })
})
