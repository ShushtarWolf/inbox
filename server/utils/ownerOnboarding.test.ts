import { describe, expect, it } from 'vitest'
import { normalizeOwnerCourtCount } from './ownerOnboarding'

describe('normalizeOwnerCourtCount', () => {
  it('seeds no courts at signup', () => {
    expect(normalizeOwnerCourtCount(3, 'padel')).toBe(0)
    expect(normalizeOwnerCourtCount(1, 'both')).toBe(0)
  })
})
