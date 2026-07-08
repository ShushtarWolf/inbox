import { coachRankingScore, getQueryNumber, parseJsonArray, reviewSummary } from '../../utils/catalog'

export default defineEventHandler(async (event) => {
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
    include: { sport: true, reviews: true, club: true },
    orderBy: [{ featured: 'desc' }, { rating: 'desc' }, { sessionPrice: 'asc' }],
  })
  const hydrated = coaches.map((coach) => {
    const specialties = parseJsonArray(coach.specialtiesJson)
    const reviews = reviewSummary(coach.reviews)
    return {
      ...coach,
      specialties,
      verified: Boolean(coach.verifiedAt),
      reviewCount: reviews.count,
      verifiedReviewCount: reviews.verifiedCount,
      rating: reviews.count ? reviews.average : coach.rating,
      rankingScore: coachRankingScore({
        featured: coach.featured,
        rating: reviews.count ? reviews.average : coach.rating,
        reviewCount: reviews.count,
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
})
