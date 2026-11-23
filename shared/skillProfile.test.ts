import { describe, expect, it } from 'vitest'
import {
  confidenceToPercent,
  outcomeLetterFromDelta,
  progressToNextHalfTier,
  winRatePercent,
} from './skillProfile.ts'

describe('skillProfile math', () => {
  it('maps confidence to percent', () => {
    expect(confidenceToPercent(0)).toBe(0)
    expect(confidenceToPercent(0.32)).toBe(32)
    expect(confidenceToPercent(1)).toBe(100)
    expect(confidenceToPercent(1.5)).toBe(100)
  })

  it('computes progress to next 0.5 tier', () => {
    expect(progressToNextHalfTier(3).progressPercent).toBe(0)
    expect(progressToNextHalfTier(3.25).nextTier).toBe(3.5)
    expect(progressToNextHalfTier(3.25).progressPercent).toBe(60)
    expect(progressToNextHalfTier(3.2).progressPercent).toBe(40)
    expect(progressToNextHalfTier(6.9).progressPercent).toBeLessThanOrEqual(100)
  })

  it('computes win rate', () => {
    expect(winRatePercent(0, 0, 0)).toBe(0)
    expect(winRatePercent(3, 1, 1)).toBe(60)
  })

  it('derives outcome letters', () => {
    expect(outcomeLetterFromDelta(0.12, 'COMPETITIVE', 'COMPLETED')).toBe('W')
    expect(outcomeLetterFromDelta(-0.1, 'COMPETITIVE', 'COMPLETED')).toBe('L')
    expect(outcomeLetterFromDelta(0, 'FRIENDLY', 'COMPLETED')).toBe('D')
    expect(outcomeLetterFromDelta(null, 'COMPETITIVE', 'OPEN')).toBe('P')
  })
})