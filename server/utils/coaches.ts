import { slugify } from './slug'

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
