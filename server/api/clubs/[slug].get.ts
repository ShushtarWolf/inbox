import { parseJsonValue, reviewSummary } from '../../utils/catalog'
import { parseFacilitiesJson } from '#shared/courtFacilities.ts'

export default defineCachedEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
  const slug = getRouterParam(event, 'slug')
  const club = await prisma.club.findUnique({
    where: { slug },
    include: {
      courts: { include: { sport: true } },
      owner: { select: { name: true } },
      media: { orderBy: { sortOrder: 'asc' } },
      reviews: { orderBy: { publishedAt: 'desc' }, take: 6 },
      coaches: {
        where: { isBookable: true },
        take: 4,
        orderBy: [{ featured: 'desc' }, { rating: 'desc' }],
        select: {
          id: true,
          nameFa: true,
          nameEn: true,
          photo: true,
          rating: true,
          headlineFa: true,
          headlineEn: true,
        },
      },
    },
  })
  if (!club || club.status !== 'ACTIVE') throw createError({ statusCode: 404, statusMessage: 'Club not found' })

  const today = todayDateStr()

  const slots = await prisma.slot.findMany({
    where: { court: { clubId: club.id }, date: today, displayStatus: 'FREE' },
    include: { court: true },
    orderBy: [{ startTime: 'asc' }],
    take: 8,
  })

  return {
    ...club,
    courts: club.courts.map((court) => ({
      ...court,
      facilities: parseFacilitiesJson(court.facilitiesJson),
    })),
    amenities: parseJsonValue<string[]>(club.amenitiesJson, []),
    pricing: parseJsonValue<Array<Record<string, unknown>>>(club.pricingJson, []),
    policies: parseJsonValue<Array<Record<string, unknown>>>(club.policiesJson, []),
    media: club.media.map((item) => ({
      id: item.id,
      url: item.url,
      captionFa: item.captionFa,
      captionEn: item.captionEn,
    })),
    reviewSummary: reviewSummary(club.reviews),
    testimonials: club.reviews.slice(0, 3),
    coordinates: club.lat && club.lng ? { lat: club.lat, lng: club.lng } : null,
    nextSlots: slots.map((s) => ({
      id: s.id,
      startTime: s.startTime,
      endTime: s.endTime,
      price: s.price,
      courtNameFa: s.court.nameFa,
      courtNameEn: s.court.nameEn,
    })),
  }
}, {
  maxAge: 60,
  getKey: (event) => `club:${getRouterParam(event, 'slug')}`,
})
