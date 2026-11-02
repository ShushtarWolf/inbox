import { describe, expect, it } from 'vitest'
import { normalizeOwnerCourtCount, ownerSetupHandoff } from './ownerOnboarding'

describe('normalizeOwnerCourtCount', () => {
  it('seeds one court per sport, ignoring the requested count', () => {
    expect(normalizeOwnerCourtCount(3, 'padel')).toBe(1)
    expect(normalizeOwnerCourtCount(3, 'tennis')).toBe(1)
    expect(normalizeOwnerCourtCount(3, 'both')).toBe(2)
    expect(ownerSetupHandoff('both', normalizeOwnerCourtCount(1, 'both'))).toBeNull()
  })
})
