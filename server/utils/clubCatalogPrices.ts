import { clubCatalogPriceRange } from '#shared/clubReadiness.ts'

/** Persist Club.priceFrom / priceTo from live court base + time-band prices. */
export async function syncClubCatalogPrices(clubId: string) {
  const courts = await prisma.court.findMany({
    where: { clubId },
    select: { price: true, pricingJson: true },
  })
  const { priceFrom, priceTo } = clubCatalogPriceRange(courts)
  if (priceFrom == null) return null
  return prisma.club.update({
    where: { id: clubId },
    data: { priceFrom, priceTo },
    select: { id: true, priceFrom: true, priceTo: true },
  })
}
