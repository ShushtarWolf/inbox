import { prisma } from '../../../utils/prisma'
import { skillLevelLabelFa } from '#shared/skillRating.ts'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const query = getQuery(event)
  const sportId = typeof query.sportId === 'string' ? query.sportId : undefined

  const rows = await prisma.userSportSkillRating.findMany({
    where: {
      userId: user.id,
      ...(sportId ? { sportId } : {}),
    },
    include: {
      sport: { select: { id: true, slug: true, nameFa: true, nameEn: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return rows.map((row) => ({
    sportId: row.sportId,
    sport: row.sport,
    rating: row.rating,
    confidence: row.confidence,
    assessmentStatus: row.assessmentStatus,
    assessedAt: row.assessedAt,
    matchesPlayed: row.matchesPlayed,
    labelFa: skillLevelLabelFa(row.rating),
  }))
})