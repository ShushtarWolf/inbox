export type BankWithdrawRail = 'coach' | 'athlete'

/**
 * Pick settlement vs top-up/refund rail for a user wallet withdraw.
 * Server-owned: never honour a client-requested rail (prevents draining the wrong book).
 */
export function resolveWithdrawRail(opts: {
  isCoach: boolean
  amount: number
  coachWithdrawable: number
  athleteCashOut: number
}): BankWithdrawRail | null {
  const amount = Math.floor(Number(opts.amount))
  if (!Number.isFinite(amount) || amount <= 0) return null

  if (!opts.isCoach) {
    return amount <= opts.athleteCashOut ? 'athlete' : null
  }

  if (amount <= opts.coachWithdrawable) return 'coach'
  if (amount <= opts.athleteCashOut) return 'athlete'
  return null
}

export function totalUserWithdrawable(opts: {
  isCoach: boolean
  coachWithdrawable: number
  athleteCashOut: number
}): number {
  if (!opts.isCoach) return Math.max(0, opts.athleteCashOut)
  return Math.max(0, opts.coachWithdrawable) + Math.max(0, opts.athleteCashOut)
}
