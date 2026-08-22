import { describe, expect, it } from 'vitest'
import {
  defaultPilotClubWhere,
  isOfficialPilotClub,
  isOfficialPilotClubName,
  isRetiredPilotClubName,
  PILOT_CLUB_NAME_FA,
  PILOT_CLUB_SLUG,
} from './pilotClub'

describe('pilot club identity', () => {
  it('treats دانشگاه علم و صنعت / iust-tennis as the live pilot', () => {
    expect(isOfficialPilotClubName(PILOT_CLUB_NAME_FA)).toBe(true)
    expect(isOfficialPilotClub({ slug: PILOT_CLUB_SLUG, nameFa: PILOT_CLUB_NAME_FA })).toBe(true)
    expect(isOfficialPilotClub({ slug: 'other', nameFa: PILOT_CLUB_NAME_FA })).toBe(true)
  })

  it('never treats باشگاه بهناز as the live pilot, even on the iust-tennis slug', () => {
    expect(isRetiredPilotClubName('باشگاه بهناز')).toBe(true)
    expect(isOfficialPilotClub({ slug: PILOT_CLUB_SLUG, nameFa: 'باشگاه بهناز' })).toBe(false)
    expect(isOfficialPilotClub({ slug: 'club-9208f4', nameFa: 'باشگاه بهناز' })).toBe(false)
  })

  it('default lookup matches IUST slug/name and excludes بهناز', () => {
    const where = defaultPilotClubWhere()
    expect(where.AND[0]?.OR).toEqual([
      { slug: PILOT_CLUB_SLUG },
      { nameFa: { contains: 'علم و صنعت' } },
    ])
    expect(where.AND[1]).toEqual({ NOT: { nameFa: { contains: 'بهناز' } } })
  })
})
