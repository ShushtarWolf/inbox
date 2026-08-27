import { resolveEntryPrizeStatus } from '#shared/competition.ts'
import {
  competitionsFeatureEnabled,
  competitionsPilotClubSlug,
} from '../../utils/competitionsGate'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  if (!competitionsFeatureEnabled(event)) {
    return []
  }

  const pilotSlug = competitionsPilotClubSlug(event)

  const entries = await prisma.competitionEntry.findMany({
    where: {
      OR: [{ athleteId: user.id }, { partnerAthleteId: user.id }],
      ...(pilotSlug ? { competition: { club: { slug: pilotSlug } } } : {}),
    },
    include: {
      payment: { select: { id: true, amount: true, status: true } },
      prizeAwards: {
        where: { athleteId: user.id },
        include: {
          discountCode: { select: { code: true, percent: true, endsAt: true } },
        },
      },
      competition: {
        include: {
          club: { select: { id: true, slug: true, nameFa: true, nameEn: true, city: true, image: true } },
          sport: { select: { id: true, slug: true, nameFa: true, nameEn: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return entries.map((entry) => {
    const isPrimaryRegistrant = entry.athleteId === user.id
    const award = entry.prizeAwards[0] ?? null
    const prizeStatus = resolveEntryPrizeStatus({
      placement: entry.placement,
      competitionStatus: entry.competition.status,
      prizesAwardedAt: entry.competition.prizesAwardedAt,
      hasAward: Boolean(award),
      isPrizeRecipient: isPrimaryRegistrant,
    })

    return {
      id: entry.id,
      status: entry.status,
      placement: entry.placement,
      isPrimaryRegistrant,
      prizeStatus,
      /** Doubles partner viewing a placed entry — prize credits the primary registrant only. */
      prizeGoesToRegistrant: Boolean(entry.placement) && !isPrimaryRegistrant,
      prizeAward: award
        ? {
            prizeType: award.prizeType,
            amount: award.amount,
            percent: award.percent,
            discountCode: award.discountCode?.code ?? null,
            discountEndsAt: award.discountCode?.endsAt ?? null,
          }
        : null,
      createdAt: entry.createdAt,
      cancelledAt: entry.cancelledAt,
      cancelReason: entry.cancelReason,
      payment: entry.payment,
      competition: {
        id: entry.competition.id,
        title: entry.competition.title,
        format: entry.competition.format,
        enrollmentType: entry.competition.enrollmentType,
        entryFee: entry.competition.entryFee,
        eventAt: entry.competition.eventAt,
        status: entry.competition.status,
        prizeType: entry.competition.prizeType,
        prizesAwardedAt: entry.competition.prizesAwardedAt,
        club: entry.competition.club,
        sport: entry.competition.sport,
      },
    }
  })
})
