import { slugify } from './slug'

/** Only admin-accepted coaches are listed publicly or bookable. */
export const PUBLIC_COACH_WHERE = { approvalStatus: 'APPROVED' } as const

export function assertCoachApproved(coach: { approvalStatus: string }) {
  if (coach.approvalStatus === 'APPROVED') return
  throw createError({ statusCode: 404, statusMessage: 'Coach not found' })
}

export async function findCoachByIdOrSlug(idOrSlug: string) {
  const coach = await prisma.coach.findUnique({ where: { id: idOrSlug } })
  if (coach) return coach

  const normalized = idOrSlug.trim().toLowerCase()
  const candidates = await prisma.coach.findMany({
    select: { id: true, nameEn: true },
  })
  const match = candidates.find((item) => slugify(item.nameEn) === normalized)
  if (!match) return null

  return prisma.coach.findUnique({ where: { id: match.id } })
}
