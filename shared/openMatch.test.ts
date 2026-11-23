import { describe, expect, it } from 'vitest'
import {
  assertOpenMatchJoinAllowed,
  defaultMaxPlayersForSportSlug,
  splitSlotPriceToman,
  viewerLevelCompatibleWithOpenMatch,
} from './openMatch.ts'

describe('openMatch', () => {
  it('splits toman deterministically with exact total', () => {
    expect(splitSlotPriceToman(1_000_001, 3)).toEqual([333_334, 333_334, 333_333])
    expect(splitSlotPriceToman(600_000, 4)).toEqual([150_000, 150_000, 150_000, 150_000])
    const parts = splitSlotPriceToman(500_000, 3)
    expect(parts.reduce((a, b) => a + b, 0)).toBe(500_000)
  })

  it('uses sport defaults for max players', () => {
    expect(defaultMaxPlayersForSportSlug('padel')).toBe(4)
    expect(defaultMaxPlayersForSportSlug('squash')).toBe(2)
    expect(defaultMaxPlayersForSportSlug('unknown')).toBe(4)
  })

  it('blocks join when full or level mismatch', () => {
    expect(assertOpenMatchJoinAllowed({
      userGender: 'MALE',
      courtAudience: 'MIXED',
      userSkillRating: 2,
      minLevel: 3,
      maxLevel: 5,
      activeJoinedCount: 1,
      maxPlayers: 4,
      status: 'OPEN',
    })).toBe('OPEN_MATCH_LEVEL_MISMATCH')

    expect(assertOpenMatchJoinAllowed({
      userGender: 'MALE',
      courtAudience: 'MIXED',
      userSkillRating: 4,
      minLevel: 3,
      maxLevel: 5,
      activeJoinedCount: 4,
      maxPlayers: 4,
      status: 'OPEN',
    })).toBe('OPEN_MATCH_FULL')
  })

  it('filters list compatibility for viewer level', () => {
    expect(viewerLevelCompatibleWithOpenMatch(3.5, 3, 4)).toBe(true)
    expect(viewerLevelCompatibleWithOpenMatch(5, 3, 4)).toBe(false)
    expect(viewerLevelCompatibleWithOpenMatch(null, 3, 4)).toBe(true)
  })
})