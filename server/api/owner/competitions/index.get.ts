import { countActiveEntries, countConfirmedEntries } from '../../../utils/competitions'
import { assertCompetitionsVisibleForClub } from '../../../utils/competitionsGate'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  assertCompetitionsVisibleForClub(club.slug, event)

  const rows = await prisma.competition.findMany({
    where: { clubId: club.id },
    include: {
      sport: { select: { id: true, slug: true, nameFa: true, nameEn: true } },
    },
    orderBy: [{ eventAt: 'desc' }],
  })

  return Promise.all(rows.map(async (row) => {
    const [activeCount, confirmedCount] = await Promise.all([
      countActiveEntries(row.id),
      countConfirmedEntries(row.id),
    ])
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
      cancelledAt: row.cancelledAt,
      cancelReason: row.cancelReason,
      prizesAwardedAt: row.prizesAwardedAt,
      sport: row.sport,
      activeCount,
      confirmedCount,
      spotsLeft: Math.max(0, row.maxParticipants - activeCount),
      createdAt: row.createdAt,
    }
  }))
})
