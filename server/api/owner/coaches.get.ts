import { PUBLIC_COACH_WHERE } from '../../utils/coaches'

/**
 * Approved coaches for owner desk pickers (packages, calendar reserve).
 * Coaches are marketplace-independent — any approved coach can be tagged on a club booking.
 */
export default defineEventHandler(async (event) => {
  await requireOwnerClub(event, 'calendar')
  if (!coachProductEnabled(event)) return []

  return prisma.coach.findMany({
    where: PUBLIC_COACH_WHERE,
    select: {
      id: true,
      nameFa: true,
      nameEn: true,
      sessionPrice: true,
    },
    orderBy: [{ nameFa: 'asc' }, { nameEn: 'asc' }],
  })
})
