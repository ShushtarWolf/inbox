import { clubRankingScore, getQueryNumber, haversineKm, parseJsonArray } from '../../utils/catalog'

export default defineCachedEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
  const query = getQuery(event)
  const sport = query.sport as string | undefined
  const city = query.city as string | undefined
  const district = query.district as string | undefined
  const amenity = query.amenity as string | undefined
  const verified = query.verified as string | undefined
  const minPrice = getQueryNumber(query.minPrice)
  const maxPrice = getQueryNumber(query.maxPrice)
  const lat = getQueryNumber(query.lat)
  const lng = getQueryNumber(query.lng)
  const radiusKm = getQueryNumber(query.radiusKm) || 15
  const sort = (query.sort as string | undefined) || 'rank'

  const where = {
    ...(sport ? { courts: { some: { sport: { slug: sport } } } } : {}),
    ...(city ? { city } : {}),
    ...(district ? { district } : {}),
    ...(verified === 'true' ? { verifiedAt: { not: null } } : {}),
    ...(typeof minPrice === 'number' ? { priceFrom: { gte: minPrice } } : {}),
    ...(typeof maxPrice === 'number' ? { priceFrom: { lte: maxPrice } } : {}),
  }
  const clubs = await prisma.club.findMany({
    where,
    include: {
      courts: { include: { sport: true } },
      _count: { select: { reviews: true } },
    },
    orderBy: [{ featured: 'desc' }, { rating: 'desc' }, { priceFrom: 'asc' }],
  })

  const hydrated = clubs.map((club) => {
    const amenities = parseJsonArray(club.amenitiesJson)
    const reviewCount = club._count.reviews
    const distanceKm =
      typeof lat === 'number' && typeof lng === 'number' && club.lat && club.lng
        ? Number(haversineKm(lat, lng, club.lat, club.lng).toFixed(1))
        : null
    return {
      id: club.id,
      slug: club.slug,
      nameFa: club.nameFa,
      nameEn: club.nameEn,
      city: club.city,
      district: club.district,
      lat: club.lat,
      lng: club.lng,
      rating: club.rating,
      reviewCount,
      verifiedReviewCount: 0,
      priceFrom: club.priceFrom,
      priceTo: club.priceTo,
      image: club.image,
      amenities,
      amenityPreview: amenities.slice(0, 3),
      verified: Boolean(club.verifiedAt),
      distanceKm,
      sports: [...new Set(club.courts.map((court) => court.sport.slug))],
      rankingScore: clubRankingScore({
        featured: club.featured,
        rating: club.rating,
        reviewCount,
        priceFrom: club.priceFrom,
        distanceKm,
      }),
    }
  }).filter((club) => !amenity || club.amenities.includes(amenity))

  hydrated.sort((left, right) => {
    if (sort === 'price') return left.priceFrom - right.priceFrom
    if (sort === 'rating') return right.rating - left.rating
    if (sort === 'nearby') return (left.distanceKm ?? Number.MAX_SAFE_INTEGER) - (right.distanceKm ?? Number.MAX_SAFE_INTEGER)
    return right.rankingScore - left.rankingScore
  })

  return hydrated.filter((club) => {
    if (!lat || !lng || club.distanceKm == null) return true
    return club.distanceKm <= radiusKm
  })
}, {
  maxAge: 60,
  getKey: (event) => `clubs:${event.path}:${JSON.stringify(getQuery(event))}`,
})
