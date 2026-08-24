import { joinCompetition } from '../../../utils/competitions'
import { assertCompetitionAccessById } from '../../../utils/competitionsGate'

export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, 'competitions:join')
  const user = await requireRole(event, 'ATHLETE')
  const competitionId = getRouterParam(event, 'id')
  if (!competitionId) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  await assertCompetitionAccessById(event, competitionId)

  const body = await readBody<{
    partnerAthleteId?: string | null
    payAtClub?: boolean
  }>(event)

  const result = await joinCompetition({
    competitionId,
    athleteId: user.id,
    partnerAthleteId: body.partnerAthleteId,
    payAtClub: Boolean(body.payAtClub),
  })

  return {
    entry: {
      id: result.entry.id,
      status: result.entry.status,
      competitionId: result.entry.competitionId,
      athleteId: result.entry.athleteId,
      partnerAthleteId: result.entry.partnerAthleteId,
      createdAt: result.entry.createdAt,
    },
    payment: result.payment
      ? {
          id: result.payment.id,
          amount: result.payment.amount,
          status: result.payment.status,
        }
      : null,
    created: result.created,
  }
})
