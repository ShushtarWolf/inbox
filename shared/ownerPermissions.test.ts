import { describe, expect, it } from 'vitest'
import {
  ALL_OWNER_PERMISSIONS,
  canAccessOwnerNav,
  defaultPermissionsForRole,
  FINANCE_SUB_PERMISSIONS,
  hasOwnerPermission,
  isOwnerPermission,
  normalizePermissions,
  OWNER_NAV_PERMISSIONS,
  parsePermissions,
} from './ownerPermissions'

describe('parsePermissions', () => {
  it('parses JSON array', () => {
    expect(parsePermissions('["calendar","finance:view"]')).toEqual(['calendar', 'finance:view'])
  })

  it('returns empty for invalid JSON', () => {
    expect(parsePermissions('not-json')).toEqual([])
    expect(parsePermissions(null)).toEqual([])
  })
})

describe('hasOwnerPermission', () => {
  it('checks permission membership', () => {
    const perms = ['calendar', 'crm']
    expect(hasOwnerPermission(perms, 'calendar')).toBe(true)
    expect(hasOwnerPermission(perms, 'finance:view')).toBe(false)
  })

  it('grants all finance sub-permissions when legacy finance is present', () => {
    const perms = ['finance']
    expect(hasOwnerPermission(perms, 'finance:view')).toBe(true)
    expect(hasOwnerPermission(perms, 'finance:transactions')).toBe(true)
    expect(hasOwnerPermission(perms, 'finance:reports')).toBe(true)
    expect(hasOwnerPermission(perms, 'finance:payouts')).toBe(true)
  })

  it('treats umbrella finance as any finance sub-permission', () => {
    const perms = ['finance:view', 'crm']
    expect(hasOwnerPermission(perms, 'finance')).toBe(true)
    expect(hasOwnerPermission(perms, 'finance:transactions')).toBe(false)
  })
})

describe('canAccessOwnerNav', () => {
  it('allows finance nav with partial finance access', () => {
    expect(canAccessOwnerNav('/owner/finance', ['finance:view'], false)).toBe(true)
    expect(canAccessOwnerNav('/owner/finance', ['calendar'], false)).toBe(false)
  })
})

describe('isOwnerPermission', () => {
  it('validates known permissions', () => {
    expect(isOwnerPermission('calendar')).toBe(true)
    expect(isOwnerPermission('finance:view')).toBe(true)
    expect(isOwnerPermission('finance')).toBe(true)
    expect(isOwnerPermission('unknown')).toBe(false)
  })
})

describe('normalizePermissions', () => {
  it('deduplicates and filters invalid entries', () => {
    expect(normalizePermissions(['calendar', 'calendar', 'finance:view', 'bad'])).toEqual(['calendar', 'finance:view'])
  })
})

describe('defaultPermissionsForRole', () => {
  it('returns role-specific defaults', () => {
    expect(defaultPermissionsForRole('MANAGER')).toContain('finance:view')
    expect(defaultPermissionsForRole('FRONT_DESK')).toEqual(['calendar', 'crm'])
    expect(defaultPermissionsForRole('COACH')).toEqual(['calendar'])
    expect(defaultPermissionsForRole('ANALYST')).toEqual(['finance:view', 'finance:transactions', 'finance:reports', 'crm'])
    expect(defaultPermissionsForRole('UNKNOWN')).toEqual(['calendar'])
  })
})

describe('OWNER_NAV_PERMISSIONS', () => {
  it('maps owner routes to permissions', () => {
    expect(OWNER_NAV_PERMISSIONS['/owner/finance']).toBe('finance')
    expect(OWNER_NAV_PERMISSIONS['/owner/crm']).toBe('crm')
    expect(OWNER_NAV_PERMISSIONS['/owner/settings']).toBe('settings')
  })
})

describe('ALL_OWNER_PERMISSIONS', () => {
  it('lists finance sub-permissions for new assignments', () => {
    expect(ALL_OWNER_PERMISSIONS).toEqual(expect.arrayContaining([...FINANCE_SUB_PERMISSIONS]))
    expect(ALL_OWNER_PERMISSIONS).not.toContain('finance')
  })
})
