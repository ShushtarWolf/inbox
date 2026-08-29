import { assertPackagesEnabled } from '../../../utils/packagesGate'
import { requireApprovedCoach, requireActiveCoachClubLink } from '../../../utils/coachClubLinks'

/** Packages-only: clubs+courts for the signed-in coach (does not require coach marketing product). */
export default defineEventHandler(async (event) => {
  assertPackagesEnabled(event)
  const user = await requireRole(event, 'COACH')
  const coach = await requireApprovedCoach(user.id)
  const query = getQuery(event)
  const clubId = typeof query.clubId === 'string' ? query.clubId : ''

  const links = await prisma.coachClubLink.findMany({
    where: { coachId: coach.id, status: 'ACTIVE' },
    include: {
      club: {
        select: {
          id: true,
          nameFa: true,
          nameEn: true,
          courts: { select: { id: true, nameFa: true, nameEn: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (clubId) {
    await requireActiveCoachClubLink(coach.id, clubId)
    const link = links.find((l) => l.clubId === clubId)
    return {
      clubId,
      courts: link?.club.courts || [],
      links: links.map((l) => ({
        status: l.status,
        club: { id: l.club.id, nameFa: l.club.nameFa, nameEn: l.club.nameEn },
      })),
    }
  }

  return {
    links: links.map((l) => ({
      status: l.status,
      club: { id: l.club.id, nameFa: l.club.nameFa, nameEn: l.club.nameEn },
      courts: l.club.courts,
    })),
  }
})
