import { describe, expect, it } from 'vitest'
import { DEFAULT_AVATAR_FEMALE, DEFAULT_AVATAR_MALE, defaultAvatarUrl, parseGender } from './gender'

describe('parseGender', () => {
  it('accepts enum values', () => {
    expect(parseGender('MALE')).toBe('MALE')
    expect(parseGender('FEMALE')).toBe('FEMALE')
  })

  it('accepts short and fa labels', () => {
    expect(parseGender('m')).toBe('MALE')
    expect(parseGender('F')).toBe('FEMALE')
    expect(parseGender('مرد')).toBe('MALE')
    expect(parseGender('زن')).toBe('FEMALE')
  })

  it('rejects empty and unknown', () => {
    expect(parseGender('')).toBeNull()
    expect(parseGender(null)).toBeNull()
    expect(parseGender('other')).toBeNull()
  })
})

describe('defaultAvatarUrl', () => {
  it('returns circle avatar for women and square for men', () => {
    expect(defaultAvatarUrl('FEMALE')).toBe(DEFAULT_AVATAR_FEMALE)
    expect(defaultAvatarUrl('MALE')).toBe(DEFAULT_AVATAR_MALE)
  })

  it('returns null when gender is unknown', () => {
    expect(defaultAvatarUrl(null)).toBeNull()
    expect(defaultAvatarUrl('')).toBeNull()
  })
})
