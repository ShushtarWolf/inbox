import { describe, expect, it } from 'vitest'
import {
  assignAddedRole,
  canAddRole,
  hasRole,
  packRoleSlots,
  pickPrimaryRole,
  platformRoleForStaffInvite,
  resolveInviteRoleUpgrade,
  userRoles,
} from './roles'

describe('roles helpers', () => {
  it('lists primary, secondary, and tertiary without duplicates', () => {
    expect(userRoles({ role: 'ATHLETE' })).toEqual(['ATHLETE'])
    expect(userRoles({ role: 'CLUB_ADMIN', secondaryRole: 'ATHLETE' })).toEqual([
      'CLUB_ADMIN',
      'ATHLETE',
    ])
    expect(userRoles({
      role: 'CLUB_ADMIN',
      secondaryRole: 'COACH',
      tertiaryRole: 'ATHLETE',
    })).toEqual(['CLUB_ADMIN', 'COACH', 'ATHLETE'])
    expect(userRoles({ role: 'ATHLETE', secondaryRole: 'ATHLETE' })).toEqual(['ATHLETE'])
  })

  it('hasRole checks all slots', () => {
    const user = {
      role: 'CLUB_ADMIN',
      secondaryRole: 'ATHLETE' as const,
      tertiaryRole: 'COACH' as const,
    }
    expect(hasRole(user, 'CLUB_ADMIN')).toBe(true)
    expect(hasRole(user, 'ATHLETE')).toBe(true)
    expect(hasRole(user, 'COACH')).toBe(true)
  })

  it('allows at most three distinct roles', () => {
    expect(canAddRole({ role: 'ATHLETE' }, 'CLUB_ADMIN')).toBe(true)
    expect(canAddRole({ role: 'ATHLETE', secondaryRole: 'COACH' }, 'CLUB_ADMIN')).toBe(true)
    expect(canAddRole({
      role: 'ATHLETE',
      secondaryRole: 'COACH',
      tertiaryRole: 'CLUB_ADMIN',
    }, 'CLUB_ADMIN')).toBe(false)
    expect(canAddRole({ role: 'ATHLETE' }, 'ATHLETE')).toBe(false)
  })

  it('promotes club admin when adding owner role to athlete', () => {
    expect(assignAddedRole({ role: 'ATHLETE' }, 'CLUB_ADMIN')).toEqual({
      role: 'CLUB_ADMIN',
      secondaryRole: 'ATHLETE',
      tertiaryRole: null,
    })
  })

  it('keeps club admin primary when adding athlete', () => {
    expect(assignAddedRole({ role: 'CLUB_ADMIN' }, 'ATHLETE')).toEqual({
      role: 'CLUB_ADMIN',
      secondaryRole: 'ATHLETE',
      tertiaryRole: null,
    })
  })

  it('fills tertiary when adding a third role', () => {
    expect(assignAddedRole(
      { role: 'CLUB_ADMIN', secondaryRole: 'ATHLETE' },
      'COACH',
    )).toEqual({
      role: 'CLUB_ADMIN',
      secondaryRole: 'ATHLETE',
      tertiaryRole: 'COACH',
    })
  })

  it('packRoleSlots orders by priority with owner primary', () => {
    expect(packRoleSlots(['ATHLETE', 'COACH', 'CLUB_ADMIN'])).toEqual({
      role: 'CLUB_ADMIN',
      secondaryRole: 'ATHLETE',
      tertiaryRole: 'COACH',
    })
  })

  it('pickPrimaryRole prefers owner over coach over athlete', () => {
    expect(pickPrimaryRole(['ATHLETE', 'CLUB_ADMIN'])).toBe('CLUB_ADMIN')
    expect(pickPrimaryRole(['COACH', 'ATHLETE'])).toBe('COACH')
  })

  it('maps staff invite roles to platform roles', () => {
    expect(platformRoleForStaffInvite('COACH')).toBe('COACH')
    expect(platformRoleForStaffInvite('MANAGER')).toBe('CLUB_ADMIN')
    expect(platformRoleForStaffInvite('FRONT_DESK')).toBe('CLUB_ADMIN')
  })

  it('resolveInviteRoleUpgrade upgrades athlete invited as manager', () => {
    expect(resolveInviteRoleUpgrade({ role: 'ATHLETE' }, 'CLUB_ADMIN')).toEqual({
      role: 'CLUB_ADMIN',
      secondaryRole: 'ATHLETE',
      tertiaryRole: null,
    })
  })

  it('resolveInviteRoleUpgrade is idempotent when role already held', () => {
    expect(resolveInviteRoleUpgrade({ role: 'COACH' }, 'COACH')).toBe('already_has')
    expect(resolveInviteRoleUpgrade(
      { role: 'CLUB_ADMIN', secondaryRole: 'ATHLETE' },
      'CLUB_ADMIN',
    )).toBe('already_has')
  })

  it('resolveInviteRoleUpgrade is already_has when all three roles are held', () => {
    // With only three PlatformRoles, a full account always already_has any target.
    expect(resolveInviteRoleUpgrade(
      { role: 'ATHLETE', secondaryRole: 'COACH', tertiaryRole: 'CLUB_ADMIN' },
      'CLUB_ADMIN',
    )).toBe('already_has')
    expect(canAddRole(
      { role: 'ATHLETE', secondaryRole: 'COACH', tertiaryRole: 'CLUB_ADMIN' },
      'ATHLETE',
    )).toBe(false)
  })
})
