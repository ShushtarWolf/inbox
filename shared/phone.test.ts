import { describe, expect, it } from 'vitest'
import {
  iranPhoneStorageVariants,
  isSyntheticPhoneEmail,
  normalizeIranPhone,
  phoneToSyntheticEmail,
} from './phone'

describe('normalizeIranPhone', () => {
  it('accepts local 09 format', () => {
    expect(normalizeIranPhone('09123456789')).toBe('09123456789')
  })

  it('normalizes +98 and 98 prefixes', () => {
    expect(normalizeIranPhone('+989123456789')).toBe('09123456789')
    expect(normalizeIranPhone('989123456789')).toBe('09123456789')
  })

  it('accepts Persian digits', () => {
    expect(normalizeIranPhone('۰۹۱۲۳۴۵۶۷۸۹')).toBe('09123456789')
  })

  it('rejects invalid numbers', () => {
    expect(normalizeIranPhone('123')).toBeNull()
    expect(normalizeIranPhone('08123456789')).toBeNull()
  })
})

describe('iranPhoneStorageVariants', () => {
  it('includes common storage forms for matching guestMobile', () => {
    const variants = iranPhoneStorageVariants('09123456789')
    expect(variants).toEqual(expect.arrayContaining([
      '09123456789',
      '9123456789',
      '989123456789',
      '+989123456789',
    ]))
  })
})

describe('phoneToSyntheticEmail', () => {
  it('builds stable synthetic emails', () => {
    expect(phoneToSyntheticEmail('09123456789')).toBe('phone.09123456789@users.inbox.local')
    expect(isSyntheticPhoneEmail('phone.09123456789@users.inbox.local')).toBe(true)
  })
})
