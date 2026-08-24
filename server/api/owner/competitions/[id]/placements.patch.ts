import { recordCompetitionPlacements } from '../../../../utils/competitions'
import { assertCompetitionsVisibleForClub } from '../../../../utils/competitionsGate'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  assertCompetitionsVisibleForClub(club.slug, event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing competition id' })

  const body = await readBody<{
    placements?: Array<{ entryId: string; placement: number | null }>
  }>(event)

  if (!body?.placements?.length) {
    throw createError({ statusCode: 400, statusMessage: 'placements required' })
  }

  const entries = await recordCompetitionPlacements({
    competitionId: id,
    clubId: club.id,
    placements: body.placements.map((row) => ({
      entryId: row.entryId,
      placement: row.placement == null ? null : Math.round(Number(row.placement)),
    })),
  })

  return { ok: true, entries }
})
