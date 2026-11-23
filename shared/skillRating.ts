/** Playtomic-style skill scale bounds. */
export const SKILL_RATING_MIN = 1
export const SKILL_RATING_MAX = 7

export type SkillWizardAnswers = {
  version: 2
  sportSlug: string
  choices: number[]
}

export type SkillQuestionnaireAnswers = {
  experienceYears: number
  matchesPerMonth: number
  techniqueSelf: number
  tacticsSelf: number
  /** Playtomic-style 6-step wizard payload (stored in rating history). */
  wizard?: SkillWizardAnswers
}

export type SkillRatingLevelLabelFa = {
  min: number
  max: number
  label: string
}

/** Persian labels for half-point bands on the 1–7 scale. */
export const SKILL_LEVEL_LABELS_FA: SkillRatingLevelLabelFa[] = [
  { min: 1, max: 1.5, label: 'مبتدی' },
  { min: 1.5, max: 2.5, label: 'تازه‌کار' },
  { min: 2.5, max: 3.5, label: 'متوسط پایین' },
  { min: 3.5, max: 4.5, label: 'متوسط' },
  { min: 4.5, max: 5.5, label: 'متوسط بالا' },
  { min: 5.5, max: 6.5, label: 'پیشرفته' },
  { min: 6.5, max: 7, label: 'حرفه‌ای' },
]

export function skillLevelLabelFa(rating: number): string {
  const r = clampSkillRating(rating)
  const band = SKILL_LEVEL_LABELS_FA.find((row) => r >= row.min && r < row.max)
    || SKILL_LEVEL_LABELS_FA[SKILL_LEVEL_LABELS_FA.length - 1]!
  return band.label
}

export function clampSkillRating(value: number): number {
  if (!Number.isFinite(value)) return 3
  return Math.min(SKILL_RATING_MAX, Math.max(SKILL_RATING_MIN, Math.round(value * 10) / 10))
}

function clampLikert(value: number): number {
  if (!Number.isFinite(value)) return 3
  return Math.min(5, Math.max(1, Math.round(value)))
}

/** Initial rating from onboarding questionnaire (per sport). */
export function computeInitialSkillRating(answers: SkillQuestionnaireAnswers): {
  rating: number
  confidence: number
} {
  const experience = Math.min(20, Math.max(0, answers.experienceYears))
  const frequency = Math.min(30, Math.max(0, answers.matchesPerMonth))
  const technique = clampLikert(answers.techniqueSelf)
  const tactics = clampLikert(answers.tacticsSelf)

  const experienceBand = experience < 1 ? 0 : experience < 3 ? 0.4 : experience < 6 ? 0.8 : 1.2
  const frequencyBand = frequency < 4 ? 0 : frequency < 8 ? 0.3 : frequency < 16 ? 0.6 : 1
  const selfBand = ((technique + tactics) / 2 - 1) / 4 * 2.2

  const rating = clampSkillRating(2.2 + experienceBand + frequencyBand + selfBand)
  return { rating, confidence: 0.35 }
}

export type EloUpdateInput = {
  currentRating: number
  currentConfidence: number
  /** Match outcome: 1 win, 0.5 draw, 0 loss (for competitive). Friendly uses small drift. */
  outcome: number
  opponentRating: number
  peerPerceivedLevel?: number | null
  fairPlayScore?: number | null
  matchType: 'FRIENDLY' | 'COMPETITIVE'
}

const ELO_K_BASE = 0.45

/**
 * Elo-style adjustment weighted by confidence (low confidence → larger moves).
 * Peer perceived level nudges the post-match target.
 */
export function applySkillRatingUpdate(input: EloUpdateInput): {
  rating: number
  confidence: number
  delta: number
} {
  const current = clampSkillRating(input.currentRating)
  const opponent = clampSkillRating(input.opponentRating)
  const conf = Math.min(1, Math.max(0, input.currentConfidence))

  const expected = 1 / (1 + 10 ** ((opponent - current) / 1.6))
  const k = ELO_K_BASE * (1.4 - conf * 0.7) * (input.matchType === 'COMPETITIVE' ? 1 : 0.35)

  let delta = k * (input.outcome - expected)

  if (typeof input.peerPerceivedLevel === 'number' && Number.isFinite(input.peerPerceivedLevel)) {
    const peer = clampSkillRating(input.peerPerceivedLevel)
    delta += (peer - current) * 0.12 * (1 - conf * 0.5)
  }

  if (typeof input.fairPlayScore === 'number') {
    const fp = Math.min(5, Math.max(1, input.fairPlayScore))
    if (fp <= 2) delta -= 0.08
    if (fp >= 5) delta += 0.04
  }

  const next = clampSkillRating(current + delta)
  const nextConf = Math.min(1, conf + (input.matchType === 'COMPETITIVE' ? 0.06 : 0.03))

  return { rating: next, confidence: nextConf, delta: Math.round((next - current) * 100) / 100 }
}

export function isSkillCompatible(
  userRating: number | null | undefined,
  minLevel: number | null | undefined,
  maxLevel: number | null | undefined,
): boolean {
  if (minLevel == null && maxLevel == null) return true
  const rating = userRating == null ? 3 : clampSkillRating(userRating)
  if (minLevel != null && rating < minLevel - 0.01) return false
  if (maxLevel != null && rating > maxLevel + 0.01) return false
  return true
}