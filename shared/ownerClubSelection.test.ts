import { describe, expect, it } from 'vitest'
import {
  ownerHasActiveClub,
  pickDefaultOwnerClubId,
  pickOwnerMembership,
} from './ownerClubSelection.ts'

const memberships = [
  { isPrimary: true, club: { id: 'c-pending', status: 'PENDING' } },
  { isPrimary: false, club: { id: 'c-active', status: 'ACTIVE' } },
]

describe('ownerClubSelection', () => {
  it('defaults to ACTIVE club when cookie unset', () => {
    expect(pickDefaultOwnerClubId(memberships, null)).toBe('c-active')
    expect(pickOwnerMembership(memberships, null).club.id).toBe('c-active')
  })

  it('respects valid cookie for pending club', () => {
    expect(pickDefaultOwnerClubId(memberships, 'c-pending')).toBe('c-pending')
    expect(pickOwnerMembership(memberships, 'c-pending').club.id).toBe('c-pending')
  })

  it('detects any active club', () => {
    expect(ownerHasActiveClub(memberships)).toBe(true)
    expect(ownerHasActiveClub([memberships[0]!])).toBe(false)
  })
})