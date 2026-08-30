import { describe, expect, it } from 'vitest'
import { parseInviteStaffRole } from './staffInvite'

describe('parseInviteStaffRole', () => {
  it('defaults to FRONT_DESK for desk staff invites', () => {
    expect(parseInviteStaffRole()).toBe('FRONT_DESK')
    expect(parseInviteStaffRole('')).toBe('FRONT_DESK')
    expect(parseInviteStaffRole('NOPE')).toBe('FRONT_DESK')
  })

  it('accepts inviteable desk staff roles only', () => {
    expect(parseInviteStaffRole('MANAGER')).toBe('MANAGER')
    expect(parseInviteStaffRole('FRONT_DESK')).toBe('FRONT_DESK')
    expect(parseInviteStaffRole('ANALYST')).toBe('ANALYST')
  })

  it('does not treat COACH as inviteable staff', () => {
    expect(parseInviteStaffRole('COACH')).toBe('FRONT_DESK')
  })
})
