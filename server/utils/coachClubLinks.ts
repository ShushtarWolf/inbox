import { prisma } from './prisma'

/** The signed-in coach's own profile, rejected unless the platform admin has accepted them. */
export async function requireApprovedCoach(userId: string) {
  const coach = await prisma.coach.findUnique({ where: { userId } })
  if (!coach) throw createError({ statusCode: 404, statusMessage: 'Coach profile not found' })
  if (coach.approvalStatus !== 'APPROVED') {
    throw createError({ statusCode: 403, statusMessage: 'COACH_NOT_APPROVED' })
  }
  return coach
}

/**
 * A coach may only book courts at clubs whose owner accepted the link, because that link
 * carries the discount percent the club agreed to bill the coach at.
 */
export async function requireActiveCoachClubLink(coachId: string, clubId: string) {
  const link = await prisma.coachClubLink.findUnique({
    where: { coachId_clubId: { coachId, clubId } },
    include: { club: true },
  })
  if (!link || link.status !== 'ACTIVE') {
    throw createError({ statusCode: 403, statusMessage: 'COACH_CLUB_LINK_NOT_ACTIVE' })
  }
  if (link.club.status !== 'ACTIVE') {
    throw createError({ statusCode: 404, statusMessage: 'Club not found' })
  }
  return link
}
