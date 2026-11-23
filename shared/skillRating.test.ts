import { describe, expect, it } from 'vitest'
import {
  applySkillRatingUpdate,
  computeInitialSkillRating,
  isSkillCompatible,
  skillLevelLabelFa,
} from './skillRating.ts'

describe('skillRating', () => {
  it('computes initial rating from questionnaire', () => {
    const low = computeInitialSkillRating({
      experienceYears: 0,
      matchesPerMonth: 2,
      techniqueSelf: 2,
      tacticsSelf: 2,
    })
    const high = computeInitialSkillRating({
      experienceYears: 8,
      matchesPerMonth: 20,
      techniqueSelf: 5,
      tacticsSelf: 5,
    })
    expect(low.rating).toBeLessThan(high.rating)
    expect(low.confidence).toBeGreaterThan(0)
  })

  it('elo update moves winner up on competitive win', () => {
    const before = applySkillRatingUpdate({
      currentRating: 3.5,
      currentConfidence: 0.4,
      outcome: 1,
      opponentRating: 3.6,
      matchType: 'COMPETITIVE',
    })
    expect(before.rating).toBeGreaterThan(3.5)
    expect(before.confidence).toBeGreaterThan(0.4)
  })

  it('respects level range guard', () => {
    expect(isSkillCompatible(3.2, 3, 4)).toBe(true)
    expect(isSkillCompatible(2.5, 3, 4)).toBe(false)
    expect(isSkillCompatible(5, 3, 4)).toBe(false)
    expect(isSkillCompatible(null, null, null)).toBe(true)
  })

  it('maps label bands in Persian', () => {
    expect(skillLevelLabelFa(1.2)).toBe('مبتدی')
    expect(skillLevelLabelFa(4)).toBe('متوسط')
    expect(skillLevelLabelFa(6.8)).toBe('حرفه‌ای')
  })
})