import { markCompetitionEntryPaid } from '../../../../../../utils/competitions'
import { assertCompetitionsVisibleForClub } from '../../../../../../utils/competitionsGate'

export default defineEventHandler(async (event) => {
  const { club, user } = await requireOwnerClub(event, 'calendar')
  assertCompetitionsVisibleForClub(club.slug, event)
  const competitionId = getRouterParam(event, 'id')
  const entryId = getRouterParam(event, 'entryId')
  if (!competitionId || !entryId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing competition or entry id' })
  }

  const entry = await markCompetitionEntryPaid({
    competitionId,
    entryId,
    clubId: club.id,
    actorUserId: user.id,
  })

  return {
    ok: true,
    entry: {
      id: entry.id,
      status: entry.status,
      paymentId: entry.paymentId,
    },
  }
})
