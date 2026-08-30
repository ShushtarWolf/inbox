import { requireActiveCoachClubLink } from '../../../../../server/utils/coachClubLinks'
import type { H3Event } from 'h3'
import { buildCalendarSourcesResponse } from './calendarSources'

/** Coach overlay — same merge/sourceDetails as owner; requires ACTIVE club link. */
export async function buildCoachCalendarSourcesForClub(opts: {
  coachId: string
  clubId: string
  date: string
}) {
  const link = await requireActiveCoachClubLink(opts.coachId, opts.clubId)
  return buildCalendarSourcesResponse({
    clubId: link.club.id,
    clubSlug: link.club.slug,
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
