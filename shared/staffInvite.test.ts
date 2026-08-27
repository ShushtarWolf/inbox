import { describe, expect, it } from 'vitest'
import { parseInviteStaffRole } from './staffInvite'

describe('parseInviteStaffRole', () => {
  it('defaults to FRONT_DESK for desk staff invites', () => {
    expect(parseInviteStaffRole()).toBe('FRONT_DESK')
    expect(parseInviteStaffRole('')).toBe('FRONT_DESK')
    expect(parseInviteStaffRole('NOPE')).toBe('FRONT_DESK')
  })

  it('accepts inviteable staff roles', () => {
    expect(parseInviteStaffRole('MANAGER')).toBe('MANAGER')
    expect(parseInviteStaffRole('FRONT_DESK')).toBe('FRONT_DESK')
    expect(parseInviteStaffRole('ANALYST')).toBe('ANALYST')
    expect(parseInviteStaffRole('COACH')).toBe('COACH')
  })
})
