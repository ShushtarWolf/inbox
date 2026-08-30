import { normalizeIranPhone } from '#shared/phone.ts'
import { joinCompetition } from '../../../utils/competitions'
import { assertCompetitionAccessById } from '../../../utils/competitionsGate'
import { findUserIdByPhone } from '../../../utils/phoneAuth'
import { requireOnlinePaymentsForAthlete } from '../../../utils/requireOnlinePayments'

export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, 'competitions:join')
  const user = await requireRole(event, 'ATHLETE')
  const competitionId = getRouterParam(event, 'id')
  if (!competitionId) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  await assertCompetitionAccessById(event, competitionId)

  const body = await readBody<{
    partnerAthleteId?: string | null
    partnerPhone?: string | null
    payAtClub?: boolean
  }>(event)

  if (body.payAtClub) {
    throw createError({ statusCode: 400, statusMessage: 'PAY_AT_CLUB_NOT_ALLOWED' })
  }

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: { entryFee: true },
  })
  if (!competition) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  if (competition.entryFee > 0) {
    requireOnlinePaymentsForAthlete()
  }

  let partnerAthleteId = body.partnerAthleteId ?? null
  const partnerPhoneRaw = typeof body.partnerPhone === 'string' ? body.partnerPhone.trim() : ''
  if (partnerPhoneRaw) {
    if (!normalizeIranPhone(partnerPhoneRaw)) {
      throw createError({ statusCode: 400, statusMessage: 'PARTNER_PHONE_INVALID' })
    }
    const partnerId = await findUserIdByPhone(partnerPhoneRaw)
    if (!partnerId) {
      throw createError({ statusCode: 400, statusMessage: 'PARTNER_NOT_REGISTERED' })
    }
    partnerAthleteId = partnerId
  }

  const result = await joinCompetition({
    competitionId,
    athleteId: user.id,
    partnerAthleteId,
    payAtClub: false,
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
