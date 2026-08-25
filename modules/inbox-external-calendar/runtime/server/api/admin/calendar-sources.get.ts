import { buildCalendarSourcesResponse } from '../../lib/calendarSources'
import { resolveActiveClubBySlug } from '../../lib/publicClubSlots'

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const query = getQuery(event)
  const clubSlug = typeof query.clubSlug === 'string' ? query.clubSlug : ''
  const date = (typeof query.date === 'string' && query.date) ? query.date : todayDateStr()

  if (!clubSlug) {
    throw createError({ statusCode: 400, statusMessage: 'clubSlug required' })
  }

  const club = await resolveActiveClubBySlug(clubSlug)
  if (!club) {
    throw createError({ statusCode: 404, statusMessage: 'Club not found' })
  }

  return buildCalendarSourcesResponse({
    clubId: club.id,
    clubSlug: club.slug,
    date,
  })
})
