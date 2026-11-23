import { describe, expect, it } from 'vitest'
import { normalizeOwnerCourtCount, ownerSetupHandoff } from './ownerOnboarding'

describe('normalizeOwnerCourtCount', () => {
  it('seeds no courts at signup', () => {
    expect(normalizeOwnerCourtCount(3, 'padel')).toBe(0)
    expect(normalizeOwnerCourtCount(1, 'both')).toBe(0)
  })
})

describe('ownerSetupHandoff', () => {
  it('only hands off when both sports were selected', () => {
    expect(ownerSetupHandoff('both')).toBe('sport-both')
    expect(ownerSetupHandoff('padel')).toBe(null)
    expect(ownerSetupHandoff('tennis')).toBe(null)
  })
})
