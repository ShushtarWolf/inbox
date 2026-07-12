import { describe, expect, it } from 'vitest'
import {
  clubRankingScore,
  coachRankingScore,
  getQueryNumber,
  haversineKm,
  parseJsonArray,
  parseJsonValue,
  reviewSummary,
} from './catalog'

describe('parseJsonArray', () => {
  it('parses string arrays', () => {
    expect(parseJsonArray('["a","b"]')).toEqual(['a', 'b'])
  })

  it('filters non-strings', () => {
    expect(parseJsonArray('[1,"ok",null]')).toEqual(['ok'])
  })

  it('returns empty for invalid input', () => {
    expect(parseJsonArray(null)).toEqual([])
    expect(parseJsonArray('not-json')).toEqual([])
    expect(parseJsonArray('{"a":1}')).toEqual([])
  })
})

describe('parseJsonValue', () => {
  it('parses JSON or returns fallback', () => {
    expect(parseJsonValue('{"x":1}', { x: 0 })).toEqual({ x: 1 })
    expect(parseJsonValue('bad', { x: 0 })).toEqual({ x: 0 })
    expect(parseJsonValue(null, [])).toEqual([])
  })
})

describe('reviewSummary', () => {
  it('computes average and verified count', () => {
    const summary = reviewSummary([
      { rating: 4, isVerified: true },
      { rating: 5, isVerified: false },
      { rating: 3, isVerified: true },
    ])
    expect(summary).toEqual({ average: 4, count: 3, verifiedCount: 2 })
  })

  it('returns zeros for empty reviews', () => {
    expect(reviewSummary([])).toEqual({ average: 0, count: 0, verifiedCount: 0 })
  })
})

describe('haversineKm', () => {
  it('returns 0 for identical coordinates', () => {
    expect(haversineKm(35.7, 51.4, 35.7, 51.4)).toBe(0)
  })

  it('computes distance between two points', () => {
    const km = haversineKm(35.6892, 51.389, 35.7219, 51.3347)
    expect(km).toBeGreaterThan(5)
    expect(km).toBeLessThan(10)
  })
})

describe('clubRankingScore', () => {
  it('boosts featured and highly rated clubs', () => {
    const base = clubRankingScore({ featured: false, rating: 3, reviewCount: 0, priceFrom: 800000 })
    const boosted = clubRankingScore({ featured: true, rating: 4.8, reviewCount: 20, priceFrom: 500000, distanceKm: 2 })
    expect(boosted).toBeGreaterThan(base)
  })
})

describe('coachRankingScore', () => {
  it('boosts bookable experienced coaches', () => {
    const base = coachRankingScore({ featured: false, rating: 3, reviewCount: 0, experienceYears: 1, isBookable: false })
    const boosted = coachRankingScore({ featured: true, rating: 4.9, reviewCount: 15, experienceYears: 8, isBookable: true })
    expect(boosted).toBeGreaterThan(base)
  })
})

describe('getQueryNumber', () => {
  it('parses finite numbers', () => {
    expect(getQueryNumber('42')).toBe(42)
    expect(getQueryNumber('3.14')).toBe(3.14)
  })

  it('returns undefined for invalid values', () => {
    expect(getQueryNumber('')).toBeUndefined()
    expect(getQueryNumber('abc')).toBeUndefined()
    expect(getQueryNumber(undefined)).toBeUndefined()
    expect(getQueryNumber(42)).toBeUndefined()
  })
})
