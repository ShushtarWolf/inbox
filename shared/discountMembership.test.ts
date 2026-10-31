import { describe, expect, it } from 'vitest'
import {
  isDiscountMembershipActive,
  isMembershipDiscountCode,
  membershipDiscountCode,
  membershipExpiresAt,
  pickBestDiscountMembership,
} from './discountMembership'

describe('isDiscountMembershipActive', () => {
  const now = new Date('2026-10-31T12:00:00.000Z')

  it('rejects revoked or inactive program', () => {
    expect(isDiscountMembershipActive({ revokedAt: now }, now)).toBe(false)
    expect(isDiscountMembershipActive({ programActive: false }, now)).toBe(false)
  })

  it('rejects expired', () => {
    expect(isDiscountMembershipActive({
      expiresAt: '2026-10-01T00:00:00.000Z',
    }, now)).toBe(false)
  })

  it('accepts open-ended active membership', () => {
    expect(isDiscountMembershipActive({ revokedAt: null, expiresAt: null }, now)).toBe(true)
  })
})

describe('pickBestDiscountMembership', () => {
  it('picks highest active percent', () => {
    const best = pickBestDiscountMembership([
      { id: 'a', percent: 10, labelFa: 'A' },
      { id: 'b', percent: 25, labelFa: 'B' },
      { id: 'c', percent: 40, labelFa: 'C', revokedAt: new Date() },
    ])
    expect(best?.id).toBe('b')
  })
})

describe('membershipDiscountCode', () => {
  it('round-trips membership marker', () => {
    expect(membershipDiscountCode('m1')).toBe('MEMBER:m1')
    expect(isMembershipDiscountCode('MEMBER:m1')).toBe(true)
    expect(isMembershipDiscountCode('STUDENT20')).toBe(false)
  })
})

describe('membershipExpiresAt', () => {
  it('returns null when unlimited', () => {
    expect(membershipExpiresAt(new Date('2026-01-15T00:00:00.000Z'), null)).toBeNull()
    expect(membershipExpiresAt(new Date('2026-01-15T00:00:00.000Z'), 0)).toBeNull()
  })

  it('adds months', () => {
    const expires = membershipExpiresAt(new Date('2026-01-15T00:00:00.000Z'), 12)
    expect(expires?.toISOString().startsWith('2027-01-15')).toBe(true)
  })
})
