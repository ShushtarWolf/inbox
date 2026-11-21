import { describe, expect, it } from 'vitest'
import {
  OWNER_SEASON_LIST_DEFAULT_LIMIT,
  OWNER_SEASON_LIST_MAX_LIMIT,
  parseOwnerSeasonListLimit,
} from './ownerSeasonList.ts'

describe('parseOwnerSeasonListLimit', () => {
  it('defaults when missing or invalid', () => {
    expect(parseOwnerSeasonListLimit(undefined)).toBe(OWNER_SEASON_LIST_DEFAULT_LIMIT)
    expect(parseOwnerSeasonListLimit('')).toBe(OWNER_SEASON_LIST_DEFAULT_LIMIT)
    expect(parseOwnerSeasonListLimit(0)).toBe(OWNER_SEASON_LIST_DEFAULT_LIMIT)
    expect(parseOwnerSeasonListLimit(-1)).toBe(OWNER_SEASON_LIST_DEFAULT_LIMIT)
  })

  it('caps at max', () => {
    expect(parseOwnerSeasonListLimit(50)).toBe(50)
    expect(parseOwnerSeasonListLimit(OWNER_SEASON_LIST_MAX_LIMIT + 99)).toBe(OWNER_SEASON_LIST_MAX_LIMIT)
  })
})