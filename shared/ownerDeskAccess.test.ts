import { describe, expect, it } from 'vitest'
import { staffCanAccessOwnerDesk } from './ownerDeskAccess'

describe('staffCanAccessOwnerDesk', () => {
  it('allows calendar permission and owner role', () => {
    expect(staffCanAccessOwnerDesk([{ role: 'OWNER', permissionsJson: '[]' }])).toBe(true)
    expect(staffCanAccessOwnerDesk([{ role: 'FRONT_DESK', permissionsJson: '["calendar"]' }])).toBe(true)
    expect(staffCanAccessOwnerDesk([{ role: 'ANALYST', permissionsJson: '["finance:view"]' }])).toBe(false)
  })
})
