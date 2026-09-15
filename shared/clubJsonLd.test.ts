import { describe, expect, it } from 'vitest'
import {
  buildClubSportsActivityLocationJsonLd,
  buildClubsItemListJsonLd,
} from './clubJsonLd.ts'
import { serializeJsonLd } from './jsonLd.ts'

describe('buildClubSportsActivityLocationJsonLd', () => {
  it('keeps the thin baseline and omits missing optional fields', () => {
    const jsonLd = buildClubSportsActivityLocationJsonLd({
      name: 'باشگاه تست',
      url: 'https://inboxs.ir/clubs/test',
      image: 'https://inboxs.ir/hero/tennis-court.jpg',
      city: 'تهران',
      streetAddress: 'خیابان تست',
      lat: 35.7,
      lng: 51.4,
    })

    expect(jsonLd['@type']).toBe('SportsActivityLocation')
    expect(jsonLd.name).toBe('باشگاه تست')
    expect(jsonLd.telephone).toBeUndefined()
    expect(jsonLd.description).toBeUndefined()
    expect(jsonLd.openingHours).toBeUndefined()
    expect(jsonLd.offers).toBeUndefined()
    expect(jsonLd.priceRange).toBeUndefined()
    expect(jsonLd.sport).toBeUndefined()
    expect(jsonLd.amenityFeature).toBeUndefined()
    expect(jsonLd.geo).toEqual({
      '@type': 'GeoCoordinates',
      latitude: 35.7,
      longitude: 51.4,
    })
  })

  it('adds phone, hours, offer, sports, amenities, and description when present', () => {
    const jsonLd = buildClubSportsActivityLocationJsonLd({
      name: 'Club',
      description: 'A real club description',
      telephone: '+989121234567',
      openHour: 8,
      closeHour: 22,
      priceFrom: 500_000,
      priceTo: 800_000,
      sports: ['پدل', 'تنیس'],
      amenities: ['پارکینگ', 'دوش'],
      aggregateRating: { ratingValue: 4.8, reviewCount: 12 },
    })

    expect(jsonLd.description).toBe('A real club description')
    expect(jsonLd.telephone).toBe('+989121234567')
    expect(jsonLd.openingHours).toBe('Mo-Su 08:00-22:00')
    expect(jsonLd.priceRange).toBe('500000-800000 IRR')
    expect(jsonLd.offers).toEqual({
      '@type': 'AggregateOffer',
      priceCurrency: 'IRR',
      lowPrice: 500_000,
      highPrice: 800_000,
      availability: 'https://schema.org/InStock',
    })
    expect(jsonLd.sport).toEqual(['پدل', 'تنیس'])
    expect(jsonLd.amenityFeature).toEqual([
      { '@type': 'LocationFeatureSpecification', name: 'پارکینگ', value: true },
      { '@type': 'LocationFeatureSpecification', name: 'دوش', value: true },
    ])
    expect(jsonLd.aggregateRating).toEqual({
      '@type': 'AggregateRating',
      ratingValue: 4.8,
      reviewCount: 12,
    })
  })

  it('serializes safely for script tags', () => {
    const raw = serializeJsonLd(
      buildClubSportsActivityLocationJsonLd({
        name: '</script><script>alert(1)</script>',
        description: 'ok',
      }),
    )
    expect(raw).not.toContain('</script>')
    expect(raw).toContain('\\u003c/script>')
  })
})

describe('buildClubsItemListJsonLd', () => {
  it('returns null for an empty list', () => {
    expect(buildClubsItemListJsonLd([])).toBeNull()
  })

  it('builds ItemList entries for clubs on the page', () => {
    const jsonLd = buildClubsItemListJsonLd(
      [
        { name: 'A', url: 'https://inboxs.ir/clubs/a' },
        { name: 'B', url: 'https://inboxs.ir/clubs/b' },
      ],
      { name: 'Clubs', url: 'https://inboxs.ir/clubs' },
    )

    expect(jsonLd).toMatchObject({
      '@type': 'ItemList',
      name: 'Clubs',
      url: 'https://inboxs.ir/clubs',
      numberOfItems: 2,
    })
    expect(jsonLd?.itemListElement).toEqual([
      {
        '@type': 'ListItem',
        position: 1,
        url: 'https://inboxs.ir/clubs/a',
        name: 'A',
        item: { '@type': 'SportsActivityLocation', name: 'A', url: 'https://inboxs.ir/clubs/a' },
      },
      {
        '@type': 'ListItem',
        position: 2,
        url: 'https://inboxs.ir/clubs/b',
        name: 'B',
        item: { '@type': 'SportsActivityLocation', name: 'B', url: 'https://inboxs.ir/clubs/b' },
      },
    ])
  })
})
