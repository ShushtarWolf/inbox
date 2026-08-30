import { requireActiveClub, requireApprovedCoach } from '../../../../../server/utils/coachClubLinks'
import type { H3Event } from 'h3'
import { buildCalendarSourcesResponse } from './calendarSources'

/** Coach overlay — same merge/sourceDetails as owner; any active club (no affiliation). */
export async function buildCoachCalendarSourcesForClub(opts: {
  coachId: string
  clubId: string
  date: string
}) {
  const club = await requireActiveClub(opts.clubId)
  return buildCalendarSourcesResponse({
    clubId: club.id,
    clubSlug: club.slug,
    date: opts.date,
  })
}

export async function handleCoachCalendarSourcesRequest(event: H3Event) {
  assertCoachProductEnabled(event)
  const user = await requireRole(event, 'COACH')
  const query = getQuery(event)
  const clubId = String(query.clubId || '')
  const date = (typeof query.date === 'string' && query.date) ? query.date : todayDateStr()

  if (!clubId) {
    throw createError({ statusCode: 400, statusMessage: 'clubId required' })
  }

  const coach = await requireApprovedCoach(user.id)
  return buildCoachCalendarSourcesForClub({
    coachId: coach.id,
    clubId,
    date,
  })
}
