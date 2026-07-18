import { coachRankingScore, getQueryNumber, parseJsonArray } from '../../utils/catalog'
import { slugify } from '../../utils/slug'

export default defineEventHandler(async (event) => {
  assertCoachProductEnabled(event)
  setHeader(event, 'Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
  const query = getQuery(event)
  const sport = query.sport as string | undefined
  const city = query.city as string | undefined
  const specialty = query.specialty as string | undefined
  const verified = query.verified as string | undefined
  const minPrice = getQueryNumber(query.minPrice)
  const maxPrice = getQueryNumber(query.maxPrice)
  const sort = (query.sort as string | undefined) || 'rank'
  const coaches = await prisma.coach.findMany({
    where: {
      ...(sport ? { sport: { slug: sport } } : {}),
      ...(city ? { city } : {}),
      ...(verified === 'true' ? { verifiedAt: { not: null } } : {}),
      ...(typeof minPrice === 'number' ? { sessionPrice: { gte: minPrice } } : {}),
      ...(typeof maxPrice === 'number' ? { sessionPrice: { lte: maxPrice } } : {}),
    },
    include: {
      sport: true,
      club: true,
      _count: { select: { reviews: true } },
    },
    orderBy: [{ featured: 'desc' }, { rating: 'desc' }, { sessionPrice: 'asc' }],
  })
  const hydrated = coaches.map((coach) => {
    const specialties = parseJsonArray(coach.specialtiesJson)
    const reviewCount = coach._count.reviews
    const { _count, ...coachData } = coach
    return {
      ...coachData,
      slug: slugify(coach.nameEn),
      specialties,
      verified: Boolean(coach.verifiedAt),
      reviewCount,
      verifiedReviewCount: 0,
      rating: coach.rating,
      rankingScore: coachRankingScore({
        featured: coach.featured,
        rating: coach.rating,
        reviewCount,
        experienceYears: coach.experienceYears,
        isBookable: coach.isBookable,
      }),
    }
  }).filter((coach) => !specialty || coach.specialties.includes(specialty))

  hydrated.sort((left, right) => {
    if (sort === 'price') return left.sessionPrice - right.sessionPrice
    if (sort === 'rating') return right.rating - left.rating
    return right.rankingScore - left.rankingScore
  })

  return hydrated
}, {
  maxAge: 60,
  getKey: (event) => `coaches:${event.path}:${JSON.stringify(getQuery(event))}`,
})
