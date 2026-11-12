import { describe, expect, it } from 'vitest'
import {
  findPrivateClubKeys,
  omitPrivateCoachFields,
  PRIVATE_CLUB_FIELDS,
  PUBLIC_CLUB_SCALAR_FIELDS,
  PUBLIC_CLUB_SELECT,
  PUBLIC_CLUB_SUMMARY_SELECT,
  PUBLIC_REVIEW_SELECT,
} from './publicClub.ts'

describe('public club allowlist', () => {
  it('never selects bank, owner, commission or admin fields', () => {
    for (const key of PRIVATE_CLUB_FIELDS) {
      expect(PUBLIC_CLUB_SELECT).not.toHaveProperty(key)
      expect(PUBLIC_CLUB_SUMMARY_SELECT).not.toHaveProperty(key)
      expect((PUBLIC_CLUB_SCALAR_FIELDS as readonly string[]).includes(key)).toBe(false)
    }
  })

  it('keeps the public club contact phone and booking policy fields the club page uses', () => {
    for (const key of ['phone', 'addressFa', 'openHour', 'closeHour', 'bookingHorizonDays', 'waitlistEnabled', 'defaultSessionDurationMinutes']) {
      expect(PUBLIC_CLUB_SELECT).toHaveProperty(key, true)
    }
  })

  it('reviews drop author account and booking links', () => {
    expect(PUBLIC_REVIEW_SELECT).not.toHaveProperty('authorUserId')
    expect(PUBLIC_REVIEW_SELECT).not.toHaveProperty('bookingId')
  })

  it('coach cards drop account link and admin notes', () => {
    const out = omitPrivateCoachFields({ id: 'c', nameFa: 'x', userId: 'u', approvalNote: 'n', verificationNote: 'v', approvalStatus: 'APPROVED' })
    expect(out).toEqual({ id: 'c', nameFa: 'x' })
  })

  it('finds private keys anywhere in a payload', () => {
    expect(findPrivateClubKeys({ a: { club: { sheba: 'IR..', ownerId: 'o' } }, list: [{ commissionBps: 0 }] }))
      .toEqual(['a.club.sheba', 'a.club.ownerId', 'list[0].commissionBps'])
    expect(findPrivateClubKeys({ id: 'x', phone: '021' })).toEqual([])
  })
})
