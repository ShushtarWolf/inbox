import { parsePrizeConfigJson } from '#shared/competition.ts'
import { countActiveEntries, countConfirmedEntries } from '../../../utils/competitions'
import { assertCompetitionsVisibleForClub } from '../../../utils/competitionsGate'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  assertCompetitionsVisibleForClub(club.slug, event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing competition id' })

  const competition = await prisma.competition.findFirst({
    where: { id, clubId: club.id },
    include: {
      sport: { select: { id: true, slug: true, nameFa: true, nameEn: true } },
      entries: {
        include: {
          athlete: { select: { id: true, name: true, phone: true } },
          partnerAthlete: { select: { id: true, name: true, phone: true } },
          payment: { select: { id: true, status: true, amount: true, method: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      prizeAwards: {
        select: { entryId: true, placement: true },
      },
    },
  })

  if (!competition) {
    throw createError({ statusCode: 404, statusMessage: 'Competition not found' })
  }

  const [activeCount, confirmedCount] = await Promise.all([
    countActiveEntries(competition.id),
    countConfirmedEntries(competition.id),
  ])

  const prizeConfig = parsePrizeConfigJson(competition.prizeConfigJson)
  const prizeAwardAudit = competition.prizeAwardAuditJson
    ? JSON.parse(competition.prizeAwardAuditJson)
    : null

  const awardedEntryIds = new Set(competition.prizeAwards.map((a) => a.entryId))

  return {
    ...competition,
    prizeConfig,
    prizeAwardAudit,
    activeCount,
    confirmedCount,
    spotsLeft: Math.max(0, competition.maxParticipants - activeCount),
    entries: competition.entries.map((entry) => ({
      id: entry.id,
      status: entry.status,
      placement: entry.placement,
      prizeAwarded: awardedEntryIds.has(entry.id),
      athlete: entry.athlete,
      partnerAthlete: entry.partnerAthlete,
      payment: entry.payment,
      createdAt: entry.createdAt,
      cancelledAt: entry.cancelledAt,
      cancelReason: entry.cancelReason,
    })),
  }
})
