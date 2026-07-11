import { findCoachByIdOrSlug } from '../../utils/coaches'
import { parseJsonArray, reviewSummary } from '../../utils/catalog'
import { slugify } from '../../utils/slug'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 404, statusMessage: 'Coach not found' })

  const coachRecord = await findCoachByIdOrSlug(id)
  if (!coachRecord) throw createError({ statusCode: 404, statusMessage: 'Coach not found' })

  const coach = await prisma.coach.findUnique({
    where: { id: coachRecord.id },
    include: {
      sport: true,
      availability: true,
      club: { select: { id: true, slug: true, nameFa: true, nameEn: true, city: true, district: true } },
      packages: {
        orderBy: { createdAt: 'desc' },
        take: 4,
        select: { id: true, title: true, price: true, discount: true, capacity: true, comment: true },
      },
      reviews: { orderBy: { publishedAt: 'desc' }, take: 6 },
      media: { orderBy: { sortOrder: 'asc' } },
    },
  })
  if (!coach) throw createError({ statusCode: 404, statusMessage: 'Coach not found' })
  return {
    ...coach,
    slug: slugify(coach.nameEn),
    specialties: parseJsonArray(coach.specialtiesJson),
    credentials: parseJsonArray(coach.credentialsJson),
    languages: parseJsonArray(coach.languagesJson),
    reviewSummary: reviewSummary(coach.reviews),
    testimonials: coach.reviews.slice(0, 3),
  }
})
