import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildWizardAnswersFromPending,
  clearPendingGuestSkillAssessment,
  GUEST_SKILL_ASSESSMENT_STORAGE_KEY,
  readPendingGuestSkillAssessment,
  savePendingGuestSkillAssessment,
} from './guestSkillAssessment.ts'

const store = new Map<string, string>()

vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
})

describe('guestSkillAssessment storage', () => {
  beforeEach(() => store.clear())

  it('round-trips pending assessment', () => {
    const pending = {
      sportSlug: 'padel',
      choices: [1, 2, 1, 2, 1, 2],
      rating: 3.8,
      labelFa: 'متوسط',
      playDescriptionFa: 'توضیح',
      savedAt: new Date().toISOString(),
    }
    expect(savePendingGuestSkillAssessment(pending)).toBe(true)
    expect(store.has(GUEST_SKILL_ASSESSMENT_STORAGE_KEY)).toBe(true)
    expect(readPendingGuestSkillAssessment()?.sportSlug).toBe('padel')
    clearPendingGuestSkillAssessment()
    expect(readPendingGuestSkillAssessment()).toBeNull()
  })

  it('builds wizard payload for API', () => {
    const answers = buildWizardAnswersFromPending({
      sportSlug: 'tennis',
      choices: [0, 0, 0, 0, 0, 0],
      rating: 2,
      labelFa: 'a',
      playDescriptionFa: 'b',
      savedAt: 'x',
    })
    expect(answers.wizard.version).toBe(2)
    expect(answers.wizard.choices).toHaveLength(6)
  })
})