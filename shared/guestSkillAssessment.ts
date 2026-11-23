import type { SkillWizardAnswers } from './skillRating.ts'

export const GUEST_SKILL_ASSESSMENT_STORAGE_KEY = 'inbox.pendingSkillAssessment.v1'

export type PendingGuestSkillAssessment = {
  sportSlug: string
  choices: number[]
  rating: number
  labelFa: string
  playDescriptionFa: string
  savedAt: string
}

export function buildWizardAnswersFromPending(
  pending: PendingGuestSkillAssessment,
): { wizard: SkillWizardAnswers } {
  return {
    wizard: {
      version: 2,
      sportSlug: pending.sportSlug,
      choices: pending.choices,
    },
  }
}

function storage(): Storage | null {
  if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) return null
  return globalThis.localStorage
}

export function savePendingGuestSkillAssessment(pending: PendingGuestSkillAssessment): boolean {
  const ls = storage()
  if (!ls) return false
  try {
    ls.setItem(GUEST_SKILL_ASSESSMENT_STORAGE_KEY, JSON.stringify(pending))
    return true
  } catch {
    return false
  }
}

export function readPendingGuestSkillAssessment(): PendingGuestSkillAssessment | null {
  const ls = storage()
  if (!ls) return null
  try {
    const raw = ls.getItem(GUEST_SKILL_ASSESSMENT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingGuestSkillAssessment
    if (!parsed?.sportSlug || !Array.isArray(parsed.choices) || parsed.choices.length !== 6) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function clearPendingGuestSkillAssessment(): void {
  storage()?.removeItem(GUEST_SKILL_ASSESSMENT_STORAGE_KEY)
}