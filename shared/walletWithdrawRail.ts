export type BankWithdrawRail = 'coach' | 'athlete'

/** Pick settlement vs top-up/refund rail for a user wallet withdraw. */
export function resolveWithdrawRail(opts: {
  isCoach: boolean
  amount: number
  coachWithdrawable: number
  athleteCashOut: number
  requestedRail?: BankWithdrawRail | null
}): BankWithdrawRail | null {
  const amount = Math.floor(Number(opts.amount))
  if (!Number.isFinite(amount) || amount <= 0) return null

  if (opts.requestedRail === 'coach' || opts.requestedRail === 'athlete') {
    return opts.requestedRail
  }

  if (!opts.isCoach) return 'athlete'

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
