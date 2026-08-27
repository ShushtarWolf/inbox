import { isOnlinePaymentsEnabled } from './bookingPayment.ts'
import { PILOT_CLUB_SLUG } from './pilotClub.ts'

export type CompetitionsGateOptions = {
  env?: NodeJS.ProcessEnv
  /** Explicit override (e.g. Nuxt runtimeConfig.public.competitionsEnabled). */
  enabled?: boolean
  pilotClubSlug?: string | null
}

/**
 * Legacy COMPETITIONS_PILOT_CLUB_SLUG values ops may still set.
 * Canonical value is always PILOT_CLUB_SLUG (`iust-tennis`).
 * Aliases are env-only — club slug `iust` / `بهناز` never silently match the live club.
 */
export const COMPETITIONS_PILOT_CLUB_SLUG_ALIASES: Readonly<Record<string, string>> = {
  iust: PILOT_CLUB_SLUG,
  'بهناز': PILOT_CLUB_SLUG,
}

const warnedPilotSlugAliases = new Set<string>()

/** Normalize pilot env/override to the live club slug; warn once per legacy alias. */
export function normalizeCompetitionsPilotClubSlug(raw: string | null | undefined): string | null {
  const slug = String(raw || '').trim()
  if (!slug) return null
  const canonical = COMPETITIONS_PILOT_CLUB_SLUG_ALIASES[slug]
  if (!canonical) return slug
  if (!warnedPilotSlugAliases.has(slug)) {
    warnedPilotSlugAliases.add(slug)
    console.warn(
      `[competitions] COMPETITIONS_PILOT_CLUB_SLUG="${slug}" is a legacy alias; using "${canonical}" (PILOT_CLUB_SLUG). Update env to ${canonical}.`,
    )
  }
  return canonical
}

function resolveCompetitionsGate(options?: CompetitionsGateOptions) {
  const env = options?.env ?? process.env
  const enabled = options?.enabled ?? (
    env.NUXT_PUBLIC_COMPETITIONS_ENABLED === 'true' || env.COMPETITIONS_ENABLED === 'true'
  )
  const rawPilot = options?.pilotClubSlug !== undefined
    ? (options.pilotClubSlug?.trim() || null)
    : ((env.NUXT_PUBLIC_COMPETITIONS_PILOT_CLUB_SLUG || env.COMPETITIONS_PILOT_CLUB_SLUG || '').trim() || null)
  return { enabled, pilotClubSlug: normalizeCompetitionsPilotClubSlug(rawPilot) }
}

/** True when competitions product is enabled (default false). */
export function isCompetitionsEnabled(options?: CompetitionsGateOptions): boolean {
  return resolveCompetitionsGate(options).enabled
}

/** Pilot club slug when set; otherwise null (all clubs visible when enabled). */
export function getCompetitionsPilotClubSlug(options?: CompetitionsGateOptions): string | null {
  return resolveCompetitionsGate(options).pilotClubSlug
}

/** True when competitions are enabled and the club is in pilot scope. */
export function isCompetitionsVisibleForClub(
  clubSlug: string | null | undefined,
  options?: CompetitionsGateOptions,
): boolean {
  const { enabled, pilotClubSlug } = resolveCompetitionsGate(options)
  if (!enabled) return false
  if (!pilotClubSlug) return true
  const slug = clubSlug?.trim()
  return Boolean(slug) && slug === pilotClubSlug
}

/** Active entry rows that consume a competition seat. */
export const ACTIVE_ENTRY_STATUSES = ['PENDING', 'CONFIRMED'] as const
export type ActiveEntryStatus = (typeof ACTIVE_ENTRY_STATUSES)[number]

export type CompetitionEnrollmentType = 'SINGLE' | 'DOUBLE'
export type CompetitionPrizeType = 'WALLET' | 'DISCOUNT'

export type PrizePlacement = {
  placement: number
  /** Fixed toman credit when prizeType is WALLET. */
  amount?: number
  /** Percent off when prizeType is DISCOUNT. */
  percent?: number
}

export type PrizeConfig = {
  placements: PrizePlacement[]
}

/** Server-side cap per WALLET placement (toman). */
export const MAX_WALLET_PRIZE_PER_PLACEMENT = 10_000_000

/** Server-side cap on total WALLET prizes per competition (toman). */
export const MAX_WALLET_PRIZE_TOTAL = 50_000_000

/** Discount prize codes expire this many days after the competition event. */
export const DISCOUNT_PRIZE_VALIDITY_DAYS = 90

/** Stable idempotency key for prize payout retries. */
export function competitionPrizeIdempotencyKey(
  competitionId: string,
  entryId: string,
  placement: number,
) {
  return `competition:${competitionId}:entry:${entryId}:place:${placement}`
}

/** Wallet credit note — one credit per placement per competition. */
export function competitionPrizeWalletNote(competitionId: string, placement: number) {
  return `competition:${competitionId}:place:${placement}`
}

export type EntryPrizeStatus = 'none' | 'pending' | 'credited'

/** Athlete-facing prize state on a competition entry. */
export function resolveEntryPrizeStatus(opts: {
  placement: number | null | undefined
  competitionStatus: CompetitionStatus
  prizesAwardedAt: Date | string | null | undefined
  hasAward: boolean
  /** Phase 1: only the primary registrant receives wallet/discount prizes. */
  isPrizeRecipient?: boolean
}): EntryPrizeStatus {
  if (!opts.placement) return 'none'
  if (opts.isPrizeRecipient === false) return 'none'
  if (opts.hasAward) return 'credited'
  if (opts.competitionStatus === 'COMPLETED' && !opts.prizesAwardedAt) return 'pending'
  return 'none'
}

/**
 * Competition status machine (enforce via assertCompetitionStatusTransition):
 *
 * DRAFT → OPEN | CANCELLED
 * OPEN → CLOSED | CANCELLED
 * CLOSED → IN_PROGRESS | CANCELLED
 * IN_PROGRESS → COMPLETED | CANCELLED
 * COMPLETED → (terminal)
 * CANCELLED → (terminal)
 *
 * Illegal skips (e.g. DRAFT → COMPLETED) are rejected.
 */
export type CompetitionStatus =
  | 'DRAFT'
  | 'OPEN'
  | 'CLOSED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'

const COMPETITION_STATUS_TRANSITIONS: Record<CompetitionStatus, readonly CompetitionStatus[]> = {
  DRAFT: ['OPEN', 'CANCELLED'],
  OPEN: ['CLOSED', 'CANCELLED'],
  CLOSED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
}

/**
 * Entry status machine:
 *
 * PENDING → CONFIRMED | CANCELLED
 * CONFIRMED → CANCELLED | REFUNDED
 * CANCELLED → (terminal)
 * REFUNDED → (terminal)
 */
export type CompetitionEntryStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'REFUNDED'

const ENTRY_STATUS_TRANSITIONS: Record<CompetitionEntryStatus, readonly CompetitionEntryStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CANCELLED', 'REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
}

export function assertCompetitionStatusTransition(from: CompetitionStatus, to: CompetitionStatus) {
  if (from === to) return
  const allowed = COMPETITION_STATUS_TRANSITIONS[from]
  if (!allowed.includes(to)) {
    throw new Error(`Invalid competition status transition: ${from} → ${to}`)
  }
}

export function assertEntryStatusTransition(from: CompetitionEntryStatus, to: CompetitionEntryStatus) {
  if (from === to) return
  const allowed = ENTRY_STATUS_TRANSITIONS[from]
  if (!allowed.includes(to)) {
    throw new Error(`Invalid entry status transition: ${from} → ${to}`)
  }
}

export function canCompetitionStatusTransition(from: CompetitionStatus, to: CompetitionStatus): boolean {
  if (from === to) return true
  return COMPETITION_STATUS_TRANSITIONS[from].includes(to)
}

export function parsePrizeConfigJson(raw: string | null | undefined): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

export function validatePrizeConfig(
  prizeType: CompetitionPrizeType,
  raw: string | PrizeConfig | null | undefined,
): PrizeConfig {
  const parsed = typeof raw === 'string' ? parsePrizeConfigJson(raw) : raw
  if (!parsed || typeof parsed !== 'object' || !('placements' in parsed)) {
    throw new Error('Invalid prize config: placements required')
  }
  const placementsRaw = (parsed as PrizeConfig).placements
  if (!Array.isArray(placementsRaw) || placementsRaw.length === 0) {
    throw new Error('Invalid prize config: at least one placement required')
  }

  const seen = new Set<number>()
  const placements: PrizePlacement[] = []

  for (const row of placementsRaw) {
    if (!row || typeof row !== 'object') {
      throw new Error('Invalid prize config: placement must be an object')
    }
    const placement = Number((row as PrizePlacement).placement)
    if (!Number.isInteger(placement) || placement < 1) {
      throw new Error('Invalid prize config: placement must be a positive integer')
    }
    if (seen.has(placement)) {
      throw new Error('Invalid prize config: duplicate placement')
    }
    seen.add(placement)

    if (prizeType === 'WALLET') {
      const amount = Number((row as PrizePlacement).amount)
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('Invalid prize config: WALLET placement requires positive amount')
      }
      const rounded = Math.round(amount)
      if (rounded > MAX_WALLET_PRIZE_PER_PLACEMENT) {
        throw new Error(`Invalid prize config: amount exceeds cap of ${MAX_WALLET_PRIZE_PER_PLACEMENT}`)
      }
      placements.push({ placement, amount: rounded })
    } else {
      const percent = Number((row as PrizePlacement).percent)
      if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
        throw new Error('Invalid prize config: DISCOUNT placement requires percent 1–100')
      }
      placements.push({ placement, percent: Math.round(percent) })
    }
  }

  if (prizeType === 'WALLET') {
    const total = placements.reduce((sum, p) => sum + (p.amount ?? 0), 0)
    if (total > MAX_WALLET_PRIZE_TOTAL) {
      throw new Error(`Invalid prize config: total exceeds cap of ${MAX_WALLET_PRIZE_TOTAL}`)
    }
  }

  return { placements: placements.sort((a, b) => a.placement - b.placement) }
}

/** Pilot max entry fee (toman) — owner create/patch must stay at or below this. */
export const MAX_COMPETITION_ENTRY_FEE = 5_000_000

/** Free-entry competitions must be explicitly sponsor-funded. */
export function assertFreeEntryAllowed(entryFee: number, sponsorFunded: boolean) {
  if (entryFee <= 0 && !sponsorFunded) {
    throw new Error('Competitions with zero entry fee require sponsorFunded')
  }
}

/** Reject entry fees above the pilot cap. */
export function assertCompetitionEntryFeeWithinCap(entryFee: number) {
  if (entryFee > MAX_COMPETITION_ENTRY_FEE) {
    throw new Error('ENTRY_FEE_TOO_HIGH')
  }
}

/** metadataJson for competition-purpose payments (wallet / IPG). */
export function competitionPaymentMetadataJson(opts: {
  competitionEntryId: string
  competitionId?: string
}) {
  return JSON.stringify({
    competitionEntryId: opts.competitionEntryId,
    ...(opts.competitionId ? { competitionId: opts.competitionId } : {}),
  })
}

/** Prisma create data for a new wallet-settled competition payment (link entry.paymentId in the same tx). */
export function buildCompetitionWalletPaymentCreateData(opts: {
  amount: number
  userId: string
  competitionEntryId: string
  competitionId: string
}) {
  return {
    amount: opts.amount,
    method: 'PAID' as const,
    status: 'PAID' as const,
    provider: 'pay_at_club',
    userId: opts.userId,
    purpose: 'competition' as const,
    metadataJson: competitionPaymentMetadataJson({
      competitionEntryId: opts.competitionEntryId,
      competitionId: opts.competitionId,
    }),
  }
}

export function isCompetitionJoinable(
  competition: {
    status: CompetitionStatus
    registrationOpens: Date | string
    registrationCloses: Date | string
    cancelledAt?: Date | string | null
  },
  now = new Date(),
): boolean {
  if (competition.status !== 'OPEN') return false
  if (competition.cancelledAt) return false
  const opens = new Date(competition.registrationOpens)
  const closes = new Date(competition.registrationCloses)
  return opens <= now && now <= closes
}

/** Unpaid PENDING entries older than this are auto-cancelled (releases seat). */
export const PENDING_ENTRY_EXPIRY_MINUTES = 10

/** Stable idempotency key for join payment — prevents duplicate charges on retry.
 * When entryId is set, cancel→rejoin gets a fresh payment instead of colliding on @unique paymentId.
 */
export function competitionJoinIdempotencyKey(
  competitionId: string,
  athleteId: string,
  entryId?: string,
) {
  return entryId
    ? `competition-entry:${competitionId}:${athleteId}:${entryId}`
    : `competition-entry:${competitionId}:${athleteId}`
}

/** Pay-at-club is only allowed when the platform is in desk mode (not online-only). */
export function isCompetitionPayAtClubAllowed(): boolean {
  return !isOnlinePaymentsEnabled()
}

/** Whether athlete may cancel/refund before the event (uses club cancellation window). */
export function canCancelCompetitionEntry(
  eventAt: Date | string,
  cancellationWindowHours: number,
  now = new Date(),
): boolean {
  const event = new Date(eventAt)
  const hoursUntil = (event.getTime() - now.getTime()) / 3600000
  return hoursUntil >= cancellationWindowHours
}

/** Entry confirms only after settlement — never on PAY_AT_CLUB / PENDING_AT_CLUB alone. */
export function isPaymentLinkedForEntryConfirm(payment: {
  status: string
  amount: number
} | null | undefined, entryFee: number): boolean {
  if (entryFee <= 0) return true
  if (!payment) return false
  if (payment.amount < entryFee) return false
  return payment.status === 'PAID'
}
