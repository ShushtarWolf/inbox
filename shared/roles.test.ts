import { describe, expect, it } from 'vitest'
import { assignAddedRole, canAddRole, hasRole, pickPrimaryRole, userRoles } from './roles'

describe('roles helpers', () => {
  it('lists primary and secondary without duplicates', () => {
    expect(userRoles({ role: 'ATHLETE' })).toEqual(['ATHLETE'])
    expect(userRoles({ role: 'CLUB_ADMIN', secondaryRole: 'ATHLETE' })).toEqual([
      'CLUB_ADMIN',
      'ATHLETE',
    ])
    expect(userRoles({ role: 'ATHLETE', secondaryRole: 'ATHLETE' })).toEqual(['ATHLETE'])
  })

  it('hasRole checks both slots', () => {
    const user = { role: 'CLUB_ADMIN', secondaryRole: 'ATHLETE' as const }
    expect(hasRole(user, 'CLUB_ADMIN')).toBe(true)
    expect(hasRole(user, 'ATHLETE')).toBe(true)
    expect(hasRole(user, 'COACH')).toBe(false)
  })

  it('allows at most two distinct roles', () => {
    expect(canAddRole({ role: 'ATHLETE' }, 'CLUB_ADMIN')).toBe(true)
    expect(canAddRole({ role: 'ATHLETE', secondaryRole: 'COACH' }, 'CLUB_ADMIN')).toBe(false)
    expect(canAddRole({ role: 'ATHLETE' }, 'ATHLETE')).toBe(false)
  })

  it('promotes club admin when adding owner role to athlete', () => {
    expect(assignAddedRole({ role: 'ATHLETE' }, 'CLUB_ADMIN')).toEqual({
      role: 'CLUB_ADMIN',
      secondaryRole: 'ATHLETE',
    })
  })

  it('keeps club admin primary when adding athlete', () => {
    expect(assignAddedRole({ role: 'CLUB_ADMIN' }, 'ATHLETE')).toEqual({
      role: 'CLUB_ADMIN',
      secondaryRole: 'ATHLETE',
    })
  })

  it('pickPrimaryRole prefers owner over coach over athlete', () => {
    expect(pickPrimaryRole(['ATHLETE', 'CLUB_ADMIN'])).toBe('CLUB_ADMIN')
    expect(pickPrimaryRole(['COACH', 'ATHLETE'])).toBe('COACH')
  })
})
