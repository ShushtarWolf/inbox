import { describe, expect, it } from 'vitest'
import {
  isPublicSkillAssessmentSlug,
  PUBLIC_SKILL_ASSESSMENT_SLUGS,
  skillAssessmentSportH1,
  skillAssessmentSportTitle,
} from './skillAssessmentSeo.ts'

describe('skillAssessmentSeo', () => {
  it('lists ten public sports', () => {
    expect(PUBLIC_SKILL_ASSESSMENT_SLUGS).toHaveLength(10)
    expect(PUBLIC_SKILL_ASSESSMENT_SLUGS).toContain('padel')
    expect(PUBLIC_SKILL_ASSESSMENT_SLUGS).toContain('table-tennis')
  })

  it('validates slugs', () => {
    expect(isPublicSkillAssessmentSlug('padel')).toBe(true)
    expect(isPublicSkillAssessmentSlug('general')).toBe(false)
    expect(isPublicSkillAssessmentSlug('unknown')).toBe(false)
  })

  it('builds Persian SEO copy per sport', () => {
    expect(skillAssessmentSportH1('futsal')).toContain('فوتسال')
    expect(skillAssessmentSportTitle('tennis')).toContain('تنیس')
  })
})