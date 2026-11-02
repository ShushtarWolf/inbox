import { describe, expect, it } from 'vitest'
import {
  hasApprovedPayoutSheba,
  resolveShebaRequestUiStatus,
  shebaChangeNeeded,
} from './shebaApproval.ts'

const VALID = 'IR820540102680020817909002'
const OTHER = 'IR062960000000100324200001'

describe('shebaApproval', () => {
  it('hasApprovedPayoutSheba requires non-empty trimmed IR sheba', () => {
    expect(hasApprovedPayoutSheba(null)).toBe(false)
    expect(hasApprovedPayoutSheba('')).toBe(false)
    expect(hasApprovedPayoutSheba(`  ${VALID}  `)).toBe(true)
  })

  it('shebaChangeNeeded compares normalized presence', () => {
    expect(shebaChangeNeeded(null, null)).toBe(false)
    expect(shebaChangeNeeded(VALID, VALID)).toBe(false)
    expect(shebaChangeNeeded(VALID, OTHER)).toBe(true)
    expect(shebaChangeNeeded(VALID, null)).toBe(true)
    expect(shebaChangeNeeded(null, VALID)).toBe(true)
  })

  it('resolveShebaRequestUiStatus prioritizes pending over active', () => {
    expect(resolveShebaRequestUiStatus({ approvedSheba: VALID, pendingRequest: { proposedSheba: OTHER } }))
      .toBe('pending')
    expect(resolveShebaRequestUiStatus({ approvedSheba: VALID })).toBe('active')
    expect(resolveShebaRequestUiStatus({
      approvedSheba: null,
      lastRejected: { adminNote: 'no' },
    })).toBe('rejected')
    expect(resolveShebaRequestUiStatus({ approvedSheba: null })).toBe('none')
  })
})
