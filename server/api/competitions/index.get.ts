import { countActiveEntries, countConfirmedEntries } from '../../utils/competitions'
import {
  competitionsFeatureEnabled,
  competitionsPilotClubSlug,
} from '../../utils/competitionsGate'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'public, max-age=60')
  if (!competitionsFeatureEnabled(event)) {
    return []
  }

  const query = getQuery(event)
  const sport = query.sport as string | undefined
  const city = query.city as string | undefined
  const status = (query.status as string | undefined) || 'OPEN'
  const pilotSlug = competitionsPilotClubSlug(event)
  const clubFilter: { city?: string; slug?: string } = {}
  if (city) clubFilter.city = city
  if (pilotSlug) clubFilter.slug = pilotSlug

  const where = {
    status: status as 'OPEN' | 'CLOSED' | 'IN_PROGRESS' | 'COMPLETED' | 'DRAFT' | 'CANCELLED',
    cancelledAt: null,
    ...(sport ? { sport: { slug: sport } } : {}),
    ...(Object.keys(clubFilter).length ? { club: clubFilter } : {}),
  }

  const rows = await prisma.competition.findMany({
    where,
    include: {
      club: { select: { id: true, slug: true, nameFa: true, nameEn: true, city: true, district: true, image: true } },
      sport: { select: { id: true, slug: true, nameFa: true, nameEn: true } },
    },
    orderBy: [{ eventAt: 'asc' }],
  })

  const items = await Promise.all(rows.map(async (row) => {
    const [activeCount, confirmedCount] = await Promise.all([
      countActiveEntries(row.id),
      countConfirmedEntries(row.id),
    ])
    const spotsLeft = Math.max(0, row.maxParticipants - activeCount)
    return {
      id: row.id,
      title: row.title,
      format: row.format,
      enrollmentType: row.enrollmentType,
      entryFee: row.entryFee,
      prizeType: row.prizeType,
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
  }))

  return items
})
