import { countActiveEntries, countConfirmedEntries } from '../../utils/competitions'
import { assertCompetitionsVisibleForClub } from '../../utils/competitionsGate'
import { parsePrizeConfigJson, validatePrizeConfig } from '#shared/competition.ts'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'public, max-age=60')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const row = await prisma.competition.findFirst({
    where: { id, cancelledAt: null },
    include: {
      club: {
        select: {
          id: true,
          slug: true,
          nameFa: true,
          nameEn: true,
          city: true,
          district: true,
          image: true,
          cancellationWindowHours: true,
        },
      },
      sport: { select: { id: true, slug: true, nameFa: true, nameEn: true } },
    },
  })
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  assertCompetitionsVisibleForClub(row.club.slug, event)

  const [activeCount, confirmedCount] = await Promise.all([
    countActiveEntries(row.id),
    countConfirmedEntries(row.id),
  ])

  let prizeConfig = null
  try {
    prizeConfig = validatePrizeConfig(row.prizeType, parsePrizeConfigJson(row.prizeConfigJson))
  } catch {
    prizeConfig = null
  }

  const spotsLeft = Math.max(0, row.maxParticipants - activeCount)
  return {
    id: row.id,
    title: row.title,
    format: row.format,
    enrollmentType: row.enrollmentType,
    entryFee: row.entryFee,
    prizeType: row.prizeType,
    prizeConfig,
    maxParticipants: row.maxParticipants,
    minParticipants: row.minParticipants,
    registrationOpens: row.registrationOpens,
    registrationCloses: row.registrationCloses,
    eventAt: row.eventAt,
    status: row.status,
    sponsorFunded: row.sponsorFunded,
    club: row.club,
    sport: row.sport,
    activeCount,
    confirmedCount,
    spotsLeft,
    isFull: activeCount >= row.maxParticipants,
  }
})
