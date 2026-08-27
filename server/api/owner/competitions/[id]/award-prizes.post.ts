import { awardCompetitionPrizes } from '../../../../utils/competitions'
import { assertCompetitionsVisibleForClub } from '../../../../utils/competitionsGate'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  assertCompetitionsVisibleForClub(club.slug, event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing competition id' })

  const existing = await prisma.competition.findFirst({
    where: { id, clubId: club.id },
  })
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Competition not found' })
  }

  const result = await awardCompetitionPrizes(id)

  return {
    ok: true,
    alreadyAwarded: Boolean(existing.prizesAwardedAt) || result.awards.every((a) => a.skipped),
    competition: result.competition,
    awards: result.awards,
    audit: result.audit,
  }
})
