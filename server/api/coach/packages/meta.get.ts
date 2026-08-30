import { assertPackagesEnabled } from '../../../utils/packagesGate'
import { requireApprovedCoach, requireActiveClub } from '../../../utils/coachClubLinks'

/** Packages-only: clubs+courts for the signed-in coach (any active club; no owner link). */
export default defineEventHandler(async (event) => {
  assertPackagesEnabled(event)
  const user = await requireRole(event, 'COACH')
  await requireApprovedCoach(user.id)
  const query = getQuery(event)
  const clubId = typeof query.clubId === 'string' ? query.clubId : ''

  const clubs = await prisma.club.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { nameFa: 'asc' },
    select: {
      id: true,
      nameFa: true,
      nameEn: true,
      courts: { select: { id: true, nameFa: true, nameEn: true } },
    },
  })

  if (clubId) {
    await requireActiveClub(clubId)
    const club = clubs.find((c) => c.id === clubId)
    return {
      clubId,
      courts: club?.courts || [],
      clubs: clubs.map((c) => ({ id: c.id, nameFa: c.nameFa, nameEn: c.nameEn })),
    }
  }

  return {
    clubs: clubs.map((c) => ({
      id: c.id,
      nameFa: c.nameFa,
      nameEn: c.nameEn,
      courts: c.courts,
    })),
  }
})
