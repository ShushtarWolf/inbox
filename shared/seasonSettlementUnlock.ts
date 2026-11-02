/**
 * Progressive club cashout for season / multi-slot series:
 * unlock only the share of sessions whose Tehran day has passed.
 * Cancelled sessions contribute 0 (their net is clawed separately).
 */
import { isSettlementCashoutEligible } from './settlement.ts'

export type SeasonUnlockSession = {
  bookingId: string
  date: string
  /** Per-session list / stored sessionPrice (relative weight). */
  sessionPrice: number
  cancelled: boolean
}

/** Latest ISO date among sessions (ledger classDate ceiling). */
export function lastSessionDate(sessions: SeasonUnlockSession[]): string | null {
  let last: string | null = null
  for (const row of sessions) {
    const d = (row.date || '').trim()
    if (!d) continue
    if (!last || d > last) last = d
  }
  return last
}

/**
 * Split ownerNet across sessions by sessionPrice weight.
 * Zero/invalid prices fall back to equal weight among rows with a date.
 */
export function allocateSessionNets(
  ownerNet: number,
  sessions: SeasonUnlockSession[],
): Map<string, number> {
  const net = Math.max(0, Math.floor(Number(ownerNet) || 0))
  const out = new Map<string, number>()
  if (!sessions.length || net <= 0) return out

  const weights = sessions.map((row) => {
    const w = Math.max(0, Math.floor(Number(row.sessionPrice) || 0))
    return w > 0 ? w : 1
  })
  const totalWeight = weights.reduce((sum, w) => sum + w, 0)
  if (totalWeight <= 0) return out

  let assigned = 0
  for (let i = 0; i < sessions.length; i += 1) {
    const row = sessions[i]!
    const isLast = i === sessions.length - 1
    const share = isLast
      ? Math.max(0, net - assigned)
      : Math.floor((net * weights[i]!) / totalWeight)
    out.set(row.bookingId, share)
    assigned += share
  }
  return out
}

/**
 * How much of ownerNet should be unlocked by `now`
 * (past non-cancelled sessions only).
 */
export function targetSeasonUnlockedNet(opts: {
  ownerNet: number
  sessions: SeasonUnlockSession[]
  now?: Date
  timeZone?: string
}): number {
  const net = Math.max(0, Math.floor(Number(opts.ownerNet) || 0))
  if (net <= 0 || !opts.sessions.length) return 0
  const shares = allocateSessionNets(net, opts.sessions)
  let unlocked = 0
  for (const row of opts.sessions) {
    if (row.cancelled) continue
    if (!isSettlementCashoutEligible(row.date, opts.now, opts.timeZone)) continue
    unlocked += shares.get(row.bookingId) || 0
  }
  return Math.min(net, unlocked)
}

/** Additional unlock amount to post (never negative). */
export function seasonUnlockDelta(opts: {
  ownerNet: number
  sessions: SeasonUnlockSession[]
  alreadyUnlocked: number
  /** Remaining after partial clawbacks; caps unlock. */
  remainingNet?: number
  now?: Date
  timeZone?: string
}): number {
  const remaining = opts.remainingNet == null
    ? Math.max(0, Math.floor(Number(opts.ownerNet) || 0))
    : Math.max(0, Math.floor(Number(opts.remainingNet) || 0))
  const target = Math.min(
    remaining,
    targetSeasonUnlockedNet({
      ownerNet: opts.ownerNet,
      sessions: opts.sessions,
      now: opts.now,
      timeZone: opts.timeZone,
    }),
  )
  const already = Math.max(0, Math.floor(Number(opts.alreadyUnlocked) || 0))
  return Math.max(0, target - already)
}
