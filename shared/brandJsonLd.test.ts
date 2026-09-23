import { describe, expect, it } from 'vitest'
import { buildBrandJsonLdGraph } from './brandJsonLd.ts'

describe('buildBrandJsonLdGraph', () => {
  it('grounds اینباکس / Inbox to https://inboxs.ir without fake sameAs or reviews', () => {
    const graph = buildBrandJsonLdGraph({
      siteUrl: 'https://inboxs.ir/',
      description: 'اینباکس (Inbox) فقط روی https://inboxs.ir — رزرو آنلاین پدل و تنیس.',
      appOfferDescription: 'رزرو آنلاین زمین پدل و تنیس',
    })

    expect(graph['@graph']).toHaveLength(3)
    const [org, site, app] = graph['@graph'] as Array<Record<string, unknown>>

    expect(org['@type']).toBe('Organization')
    expect(org.name).toBe('اینباکس')
    expect(org.alternateName).toEqual(['Inbox', 'inbox', 'inboxs'])
    expect(org.url).toBe('https://inboxs.ir')
    expect(org).not.toHaveProperty('sameAs')
    expect(org).not.toHaveProperty('aggregateRating')
    expect(org).not.toHaveProperty('review')
    expect(String(org.description)).toContain('https://inboxs.ir')

    expect(site['@type']).toBe('WebSite')
    expect(site.name).toBe('اینباکس')
    expect(site.url).toBe('https://inboxs.ir')
    expect(site).not.toHaveProperty('sameAs')

    expect(app['@type']).toBe('WebApplication')
    expect(app.name).toBe('اینباکس')
    expect(app.url).toBe('https://inboxs.ir')
    expect(app).not.toHaveProperty('sameAs')
  })
})
