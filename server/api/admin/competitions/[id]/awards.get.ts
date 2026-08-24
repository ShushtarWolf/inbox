import { requireAdminSecret } from '../../../../utils/adminAuth'

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing competition id' })

  const competition = await prisma.competition.findUnique({
    where: { id },
    include: {
      club: { select: { id: true, slug: true, nameFa: true, nameEn: true } },
      entries: {
        where: { placement: { not: null } },
        select: {
          id: true,
          placement: true,
          status: true,
          athlete: { select: { id: true, name: true, email: true } },
          partnerAthlete: { select: { id: true, name: true } },
        },
        orderBy: { placement: 'asc' },
      },
      prizeAwards: {
        include: {
          athlete: { select: { id: true, name: true, email: true } },
          entry: { select: { id: true, status: true } },
          discountCode: { select: { id: true, code: true, percent: true, endsAt: true, redemptionCount: true } },
        },
        orderBy: { placement: 'asc' },
      },
    },
  })

  if (!competition) {
    throw createError({ statusCode: 404, statusMessage: 'Competition not found' })
  }

  const prizeAwardAudit = competition.prizeAwardAuditJson
    ? JSON.parse(competition.prizeAwardAuditJson)
    : null

  return {
    competition: {
      id: competition.id,
      title: competition.title,
      status: competition.status,
      prizeType: competition.prizeType,
      prizesAwardedAt: competition.prizesAwardedAt,
      club: competition.club,
    },
    prizeAwardAudit,
    placedEntries: competition.entries,
    awards: competition.prizeAwards.map((award) => ({
      id: award.id,
      placement: award.placement,
      prizeType: award.prizeType,
      amount: award.amount,
      percent: award.percent,
      athlete: award.athlete,
      entry: award.entry,
      discountCode: award.discountCode,
      walletTransactionId: award.walletTransactionId,
      createdAt: award.createdAt,
    })),
  }
})
