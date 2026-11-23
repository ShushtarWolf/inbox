import { courtAudienceBlockReason, parseCourtAudience } from './courtAudience.ts'
import { parseGender } from './gender.ts'
import { clampSkillRating, isSkillCompatible } from './skillRating.ts'

export type OpenMatchGateOptions = {
  env?: NodeJS.ProcessEnv
  enabled?: boolean
}

export function isOpenMatchEnabled(options?: OpenMatchGateOptions): boolean {
  if (typeof options?.enabled === 'boolean') return options.enabled
  const env = options?.env ?? (typeof process !== 'undefined' ? process.env : undefined)
  if (!env) return false
  return (
    env.OPEN_MATCH_ENABLED === 'true'
    || env.NUXT_PUBLIC_OPEN_MATCH_ENABLED === 'true'
  )
}

/** Default player cap when creating هم‌بازی for a sport slug. */
export const DEFAULT_MAX_PLAYERS_BY_SPORT_SLUG: Record<string, number> = {
  padel: 4,
  tennis: 4,
  'table-tennis': 2,
  badminton: 2,
  squash: 2,
  pickleball: 4,
}

export function defaultMaxPlayersForSportSlug(slug: string): number {
  const key = slug.trim().toLowerCase()
  return DEFAULT_MAX_PLAYERS_BY_SPORT_SLUG[key] ?? 4
}

/** Minutes before slot start when unfilled split matches auto-cancel (env override). */
export function openMatchFillCutoffMinutes(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.OPEN_MATCH_FILL_CUTOFF_MINUTES || env.NUXT_PUBLIC_OPEN_MATCH_FILL_CUTOFF_MINUTES
  const n = Number(raw)
  if (Number.isFinite(n) && n >= 15) return Math.floor(n)
  return 120
}

/**
 * Deterministic toman split — remainder distributed to lowest indices first
 * so club settlement always sums to slotTotalPrice.
 */
export function splitSlotPriceToman(slotTotalPrice: number, playerCount: number): number[] {
  const n = Math.max(1, Math.floor(playerCount))
  const total = Math.max(0, Math.floor(slotTotalPrice))
  const base = Math.floor(total / n)
  const remainder = total - base * n
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0))
}

export function openMatchJoinIdempotencyKey(openMatchId: string, userId: string, participantId: string): string {
  return `open-match:${openMatchId}:${userId}:${participantId}`
}

export type OpenMatchJoinGuardInput = {
  userGender: string | null | undefined
  courtAudience: string
  userSkillRating: number | null | undefined
  minLevel: number | null | undefined
  maxLevel: number | null | undefined
  activeJoinedCount: number
  maxPlayers: number
  status: string
}

export function assertOpenMatchJoinAllowed(input: OpenMatchJoinGuardInput): string | null {
  if (!['OPEN', 'FULL'].includes(input.status)) return 'OPEN_MATCH_NOT_JOINABLE'
  if (input.activeJoinedCount >= input.maxPlayers) return 'OPEN_MATCH_FULL'
  const audience = parseCourtAudience(input.courtAudience)
  const gender = parseGender(input.userGender)
  const block = courtAudienceBlockReason(audience, gender)
  if (block) return block
  if (!isSkillCompatible(input.userSkillRating, input.minLevel, input.maxLevel)) {
    return 'OPEN_MATCH_LEVEL_MISMATCH'
  }
  return null
}

export function computeShareForParticipant(
  slotTotalPrice: number,
  maxPlayers: number,
  seatIndex: number,
): number {
  const shares = splitSlotPriceToman(slotTotalPrice, maxPlayers)
  const idx = Math.max(0, Math.min(shares.length - 1, seatIndex))
  return shares[idx]!
}

export type OpenMatchListFilters = {
  sportId?: string
  clubId?: string
  city?: string
  paymentMode?: 'HOST_PAYS' | 'SPLIT_ONLINE'
  dateFrom?: string
  dateTo?: string
  viewerRating?: number | null
}

export function viewerLevelCompatibleWithOpenMatch(
  viewerRating: number | null | undefined,
  minLevel: number | null | undefined,
  maxLevel: number | null | undefined,
): boolean {
  if (viewerRating == null) return true
  return isSkillCompatible(clampSkillRating(viewerRating), minLevel, maxLevel)
}