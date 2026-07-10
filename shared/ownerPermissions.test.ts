import { describe, expect, it } from 'vitest'
import { hasOwnerPermission, parsePermissions } from './ownerPermissions'

describe('parsePermissions', () => {
  it('parses JSON array', () => {
    expect(parsePermissions('["calendar","finance"]')).toEqual(['calendar', 'finance'])
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
    expect(hasOwnerPermission(perms, 'finance')).toBe(false)
  })
})
