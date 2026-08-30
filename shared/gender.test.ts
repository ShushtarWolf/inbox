import { describe, expect, it } from 'vitest'
import { parseGender } from './gender'

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
