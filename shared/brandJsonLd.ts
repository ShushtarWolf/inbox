import { serializeJsonLd } from './jsonLd.ts'

export type BrandJsonLdInput = {
  siteUrl?: string
  /** Short crawlable brand blurb (Organization + WebSite description). */
  description: string
  /** Optional offer/app blurb for WebApplication.offers.description. */
  appOfferDescription?: string
}

function siteBase(url?: string) {
  return String(url || 'https://inboxs.ir').replace(/\/$/, '') || 'https://inboxs.ir'
}

/**
 * Organization + WebSite + WebApplication graph for brand–domain grounding.
 * Omits sameAs until we have verified public profile URLs (no inventing).
 */
export function buildBrandJsonLdGraph(input: BrandJsonLdInput) {
  const base = siteBase(input.siteUrl)
  const description = input.description.trim()
  const orgId = `${base}/#organization`
  const siteId = `${base}/#website`
  const appId = `${base}/#app`

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': orgId,
        name: 'اینباکس',
        alternateName: ['Inbox', 'inbox', 'inboxs'],
        legalName: 'اینباکس',
        url: base,
        logo: {
          '@type': 'ImageObject',
          url: `${base}/icons/apple-touch-icon.png`,
        },
        email: 'support@inboxs.ir',
        description,
        areaServed: {
          '@type': 'Country',
          name: 'Iran',
        },
      },
      {
        '@type': 'WebSite',
        '@id': siteId,
        url: base,
        name: 'اینباکس',
        alternateName: ['Inbox', 'inboxs.ir'],
        inLanguage: 'fa-IR',
        description,
        publisher: { '@id': orgId },
        about: { '@id': orgId },
      },
      {
        '@type': 'WebApplication',
        '@id': appId,
        name: 'اینباکس',
        alternateName: ['Inbox', 'inbox'],
        url: base,
        applicationCategory: 'SportsApplication',
        operatingSystem: 'Web',
        inLanguage: 'fa-IR',
        description,
        provider: { '@id': orgId },
        isPartOf: { '@id': siteId },
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'IRR',
          description: (input.appOfferDescription || description).trim(),
        },
      },
    ],
  }
}

export function serializeBrandJsonLd(input: BrandJsonLdInput) {
  return serializeJsonLd(buildBrandJsonLdGraph(input))
}
