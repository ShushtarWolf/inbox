import { formatHour } from './recurringSessions.ts'

export type ClubSportsActivityLocationInput = {
  name: string
  url?: string
  image?: string
  description?: string | null
  telephone?: string | null
  city?: string | null
  streetAddress?: string | null
  lat?: number | null
  lng?: number | null
  openHour?: number | null
  closeHour?: number | null
  priceFrom?: number | null
  priceTo?: number | null
  /** Localized or English sport names already resolved by the caller. */
  sports?: string[]
  /** Localized amenity labels already resolved by the caller. */
  amenities?: string[]
  aggregateRating?: { ratingValue: number; reviewCount: number } | null
}

export type ClubsItemListEntry = {
  name: string
  url: string
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean))]
}

/** Build SportsActivityLocation JSON-LD; omit fields we do not have (no invented NAP). */
export function buildClubSportsActivityLocationJsonLd(
  input: ClubSportsActivityLocationInput,
): Record<string, unknown> {
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SportsActivityLocation',
    name: input.name,
  }

  if (input.url) jsonLd.url = input.url
  if (input.image) jsonLd.image = input.image

  const description = input.description?.trim()
  if (description) jsonLd.description = description

  const telephone = input.telephone?.trim()
  if (telephone) jsonLd.telephone = telephone

  const city = input.city?.trim()
  const streetAddress = input.streetAddress?.trim()
  if (city || streetAddress) {
    jsonLd.address = {
      '@type': 'PostalAddress',
      ...(city ? { addressLocality: city } : {}),
      ...(streetAddress ? { streetAddress } : {}),
      addressCountry: 'IR',
    }
  }

  if (input.lat != null && input.lng != null) {
    jsonLd.geo = {
      '@type': 'GeoCoordinates',
      latitude: input.lat,
      longitude: input.lng,
    }
  }

  if (
    typeof input.openHour === 'number'
    && typeof input.closeHour === 'number'
    && Number.isFinite(input.openHour)
    && Number.isFinite(input.closeHour)
    && input.openHour >= 0
    && input.closeHour > input.openHour
  ) {
    jsonLd.openingHours = `Mo-Su ${formatHour(input.openHour)}-${formatHour(input.closeHour)}`
  }

  const priceFrom = typeof input.priceFrom === 'number' && input.priceFrom > 0 ? input.priceFrom : null
  const priceTo = typeof input.priceTo === 'number' && input.priceTo > 0 ? input.priceTo : null
  if (priceFrom != null) {
    const low = priceFrom
    const high = priceTo != null && priceTo >= priceFrom ? priceTo : priceFrom
    jsonLd.offers = {
      '@type': 'AggregateOffer',
      priceCurrency: 'IRR',
      lowPrice: low,
      highPrice: high,
      availability: 'https://schema.org/InStock',
    }
    jsonLd.priceRange =
      high === low ? `${low} IRR` : `${low}-${high} IRR`
  }

  const sports = uniqueNonEmpty(input.sports || [])
  if (sports.length === 1) jsonLd.sport = sports[0]
  else if (sports.length > 1) jsonLd.sport = sports

  const amenities = uniqueNonEmpty(input.amenities || [])
  if (amenities.length) {
    jsonLd.amenityFeature = amenities.map((name) => ({
      '@type': 'LocationFeatureSpecification',
      name,
      value: true,
    }))
  }

  const summary = input.aggregateRating
  if (summary && summary.reviewCount > 0 && summary.ratingValue > 0) {
    jsonLd.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: summary.ratingValue,
      reviewCount: summary.reviewCount,
    }
  }

  return jsonLd
}

/** ItemList of clubs currently shown on a listing page. */
export function buildClubsItemListJsonLd(
  items: ClubsItemListEntry[],
  opts?: { name?: string; url?: string },
): Record<string, unknown> | null {
  const list = items.filter((item) => item.name && item.url)
  if (!list.length) return null

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    numberOfItems: list.length,
    itemListElement: list.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: item.url,
      name: item.name,
      item: {
        '@type': 'SportsActivityLocation',
        name: item.name,
        url: item.url,
      },
    })),
  }

  if (opts?.name) jsonLd.name = opts.name
  if (opts?.url) jsonLd.url = opts.url

  return jsonLd
}
