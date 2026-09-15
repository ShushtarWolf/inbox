/**
 * Live FA-only city+sport SEO hubs (crawlable landers).
 * Expand this whitelist when shipping more geo/sport pages.
 */
export type GeoSportHub = {
  citySlug: string
  sportSlug: 'padel' | 'tennis'
  /** Exact Club.city value for /api/clubs?city= */
  apiCity: string
  /** Key under clubs.hubs.* in fa.json */
  i18nKey: 'tehranPadel' | 'tehranTennis'
  heroImage: string
  path: string
}

export const GEO_SPORT_HUBS: readonly GeoSportHub[] = [
  {
    citySlug: 'tehran',
    sportSlug: 'padel',
    apiCity: 'تهران',
    i18nKey: 'tehranPadel',
    heroImage: '/hero/padel-court.jpg',
    path: '/clubs/tehran/padel',
  },
  {
    citySlug: 'tehran',
    sportSlug: 'tennis',
    apiCity: 'تهران',
    i18nKey: 'tehranTennis',
    heroImage: '/hero/tennis-court.jpg',
    path: '/clubs/tehran/tennis',
  },
]

export function findGeoSportHub(citySlug: string, sportSlug: string): GeoSportHub | undefined {
  const city = String(citySlug || '').trim().toLowerCase()
  const sport = String(sportSlug || '').trim().toLowerCase()
  return GEO_SPORT_HUBS.find((hub) => hub.citySlug === city && hub.sportSlug === sport)
}

export function listGeoSportHubPaths(): string[] {
  return GEO_SPORT_HUBS.map((hub) => hub.path)
}

export function siblingGeoSportHub(hub: GeoSportHub): GeoSportHub | undefined {
  return GEO_SPORT_HUBS.find(
    (candidate) => candidate.citySlug === hub.citySlug && candidate.sportSlug !== hub.sportSlug,
  )
}
