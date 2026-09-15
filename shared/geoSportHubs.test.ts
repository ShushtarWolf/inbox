import { describe, expect, it } from 'vitest'
import {
  findGeoSportHub,
  listGeoSportHubPaths,
  siblingGeoSportHub,
} from './geoSportHubs'

describe('geoSportHubs', () => {
  it('resolves live Tehran hubs', () => {
    const padel = findGeoSportHub('tehran', 'padel')
    const tennis = findGeoSportHub('Tehran', 'TENNIS')
    expect(padel?.path).toBe('/clubs/tehran/padel')
    expect(padel?.apiCity).toBe('تهران')
    expect(tennis?.path).toBe('/clubs/tehran/tennis')
  })

  it('returns undefined for unknown hubs', () => {
    expect(findGeoSportHub('tehran', 'squash')).toBeUndefined()
    expect(findGeoSportHub('isfahan', 'padel')).toBeUndefined()
  })

  it('lists sitemap paths and siblings', () => {
    expect(listGeoSportHubPaths()).toEqual(['/clubs/tehran/padel', '/clubs/tehran/tennis'])
    const padel = findGeoSportHub('tehran', 'padel')!
    expect(siblingGeoSportHub(padel)?.sportSlug).toBe('tennis')
  })
})
