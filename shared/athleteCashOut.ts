/**
 * Athlete bank cash-out is limited to top-up + cancel-refund credit nets.
 * Settlement credits (coach) stay on the coach withdraw path.
 */

export const ATHLETE_WITHDRAW_MIN_IRR = Number(process.env.ATHLETE_WITHDRAW_MIN_IRR || 50_000)
export const ATHLETE_WITHDRAW_MAX_IRR = Number(process.env.ATHLETE_WITHDRAW_MAX_IRR || 50_000_000)
export const ATHLETE_WITHDRAW_DAILY_MAX_IRR = Number(process.env.ATHLETE_WITHDRAW_DAILY_MAX_IRR || 50_000_000)

export type AthleteCashOutTx = {
  amount: number
  type: string
}

/** Net toman available for athlete SHEBA cash-out from ledger types. */
export function athleteCashOutFromTxs(txs: AthleteCashOutTx[]): number {
  let net = 0
  for (const tx of txs) {
    if (tx.type === 'TOPUP_CREDIT' || tx.type === 'REFUND_CREDIT') net += Math.max(0, tx.amount)
    else if (tx.type === 'PAYMENT_DEBIT') net += Math.min(0, tx.amount) // amounts are negative for debits
    else if (tx.type === 'WITHDRAW_HOLD' || tx.type === 'WITHDRAW_PAID') {
      // HOLD locks available; PAID amount is often 0 — ignore here; caller caps by available.
    }
  }
  return Math.max(0, net)
}

export function clampAthleteWithdrawAmount(amount: number, caps: {
  available: number
  cashOutNet: number
  dailyRemaining: number
}): { ok: true; amount: number } | { ok: false; reason: string } {
  const n = Math.floor(amount)
  if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: 'invalid' }
  if (n < ATHLETE_WITHDRAW_MIN_IRR) return { ok: false, reason: 'below_min' }
  if (n > ATHLETE_WITHDRAW_MAX_IRR) return { ok: false, reason: 'above_max' }
  if (n > caps.dailyRemaining) return { ok: false, reason: 'daily_cap' }
  if (n > caps.available) return { ok: false, reason: 'available' }
  if (n > caps.cashOutNet) return { ok: false, reason: 'cash_out_net' }
  return { ok: true, amount: n }
}
