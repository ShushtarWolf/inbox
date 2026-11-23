import { describe, expect, it } from 'vitest'
import {
  SKILL_ASSESSMENT_SPORT_KEYS,
  computeRatingFromWizard,
  getSkillAssessmentQuestionnaire,
  parseSkillAssessmentAnswers,
  resolveAssessmentSportKey,
  validateWizardChoices,
} from './skillAssessment.ts'

describe('skillAssessment wizard', () => {
  it('exposes tailored keys including general fallback', () => {
    expect(SKILL_ASSESSMENT_SPORT_KEYS).toContain('padel')
    expect(SKILL_ASSESSMENT_SPORT_KEYS).toContain('football')
    expect(SKILL_ASSESSMENT_SPORT_KEYS).toContain('general')
    expect(resolveAssessmentSportKey('unknown-sport')).toBe('general')
    expect(resolveAssessmentSportKey('padel')).toBe('padel')
  })

  it('returns six questions per sport', () => {
    for (const slug of ['padel', 'tennis', 'volleyball', 'general']) {
      const q = getSkillAssessmentQuestionnaire(slug)
      expect(q).toHaveLength(6)
      expect(q.filter((row) => row.kind === 'base')).toHaveLength(3)
      expect(q.filter((row) => row.kind === 'sport')).toHaveLength(3)
    }
  })

  it('scores beginner below intermediate and advanced', () => {
    const beginner = computeRatingFromWizard('padel', [0, 0, 0, 0, 0, 0])
    const mid = computeRatingFromWizard('padel', [1, 1, 1, 1, 1, 1])
    const advanced = computeRatingFromWizard('padel', [3, 3, 3, 3, 3, 3])
    expect(beginner.rating).toBeLessThan(mid.rating)
    expect(mid.rating).toBeLessThan(advanced.rating)
    expect(advanced.rating).toBeGreaterThan(5)
    expect(beginner.rating).toBeLessThan(2.8)
  })

  it('calibrates football and tennis independently', () => {
    const choices = [2, 2, 2, 2, 2, 2]
    const fb = computeRatingFromWizard('football', choices)
    const tennis = computeRatingFromWizard('tennis', choices)
    expect(fb.rating).toBeGreaterThan(3)
    expect(tennis.rating).toBeGreaterThan(3)
    expect(Math.abs(fb.rating - tennis.rating)).toBeLessThan(0.01)
  })

  it('validates wizard payload for API', () => {
    const choices = [0, 1, 2, 1, 2, 3]
    expect(validateWizardChoices('badminton', choices)).toBe(true)
    expect(validateWizardChoices('badminton', [0, 1, 2])).toBe(false)
    const parsed = parseSkillAssessmentAnswers({
      wizard: { version: 2, sportSlug: 'squash', choices },
    })
    expect(parsed?.answers.wizard?.choices).toEqual(choices)
  })
})