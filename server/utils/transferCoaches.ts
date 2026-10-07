import type { Prisma } from '@prisma/client'
import { PUBLIC_COACH_WHERE } from './coaches'

/**
 * Coaches eligible for club↔coach wallet transfer with the given club.
 * Matches transferClubCoach affiliation: home clubId or active staff link.
 */
export function affiliatedTransferCoachWhere(clubId: string): Prisma.CoachWhereInput {
  return {
    AND: [
      PUBLIC_COACH_WHERE,
      { userId: { not: null } },
      {
        OR: [
          { clubId },
          { membershipLinks: { some: { clubId, active: true } } },
          {
            user: {
              memberships: {
                some: { clubId, active: true, role: 'COACH' },
              },
            },
          },
        ],
      },
    ],
  }
}

export async function listTransferCoachesForClub(clubId: string) {
  return prisma.coach.findMany({
    where: affiliatedTransferCoachWhere(clubId),
    select: {
      id: true,
      nameFa: true,
      nameEn: true,
      sessionPrice: true,
    },
    orderBy: [{ nameFa: 'asc' }, { nameEn: 'asc' }],
  })
}
