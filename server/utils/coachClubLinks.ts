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

/** Active club for coach court booking — no owner affiliation required. */
export async function requireActiveClub(clubId: string) {
  const club = await prisma.club.findFirst({
    where: { id: clubId, status: 'ACTIVE' },
  })
  if (!club) {
    throw createError({ statusCode: 404, statusMessage: 'Club not found' })
  }
  return club
}
