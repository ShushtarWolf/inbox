import { describe, expect, it } from 'vitest'
import { slugify } from './slug'

describe('slugify', () => {
  it('lowercases and hyphenates names', () => {
    expect(slugify('Tehran Sports Club')).toBe('tehran-sports-club')
  })

  it('strips special characters', () => {
    expect(slugify('Club #1 — Downtown!')).toBe('club-1-downtown')
  })

  it('collapses repeated hyphens', () => {
    expect(slugify('club   name')).toBe('club-name')
  })

  it('falls back to club for empty input', () => {
    expect(slugify('!!!')).toBe('club')
    expect(slugify('')).toBe('club')
  })

  it('truncates to 40 characters', () => {
    const long = 'a'.repeat(60)
    expect(slugify(long).length).toBeLessThanOrEqual(40)
  })
})
