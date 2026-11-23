import { clampSkillRating, skillLevelLabelFa } from './skillRating.ts'
import { skillLevelPlayDescriptionFa } from './skillAssessment.ts'

export type MatchOutcomeLetter = 'W' | 'L' | 'D' | 'P'

export type SkillProgressionPoint = {
  id: string
  createdAt: string
  rating: number
  delta: number
  reason: string
  matchId?: string | null
}

export function confidenceToPercent(confidence: number): number {
  if (!Number.isFinite(confidence)) return 0
  return Math.round(Math.min(1, Math.max(0, confidence)) * 100)
}

/** Progress toward the next 0.5 step on the 1–7 scale. */
export function progressToNextHalfTier(rating: number): {
  nextTier: number
  progressPercent: number
} {
  const r = clampSkillRating(rating)
  const floor = Math.floor(r * 2) / 2
  let next = floor + 0.5
  if (r >= 7) return { nextTier: 7, progressPercent: 100 }
  if (r <= floor + 0.001) next = floor + 0.5
  const span = next - floor
  const progressPercent = span <= 0
    ? 100
    : Math.round(Math.min(100, Math.max(0, ((r - floor) / span) * 100)))
  return { nextTier: clampSkillRating(next), progressPercent }
}

export function winRatePercent(wins: number, losses: number, draws: number): number {
  const decided = wins + losses + draws
  if (decided <= 0) return 0
  return Math.round((wins / decided) * 100)
}

/** Infer W/L/D from post-match rating movement (friendly stays draw unless large swing). */
export function outcomeLetterFromDelta(
  delta: number | null | undefined,
  matchType: 'FRIENDLY' | 'COMPETITIVE',
  status: string,
): MatchOutcomeLetter {
  if (status !== 'COMPLETED') return 'P'
  if (matchType === 'FRIENDLY') return delta == null ? 'P' : 'D'
  if (delta == null) return 'P'
  if (delta > 0.06) return 'W'
  if (delta < -0.06) return 'L'
  return 'D'
}

export function buildSportSkillLabels(rating: number) {
  return {
    labelFa: skillLevelLabelFa(rating),
    descriptionFa: skillLevelPlayDescriptionFa(rating),
  }
}