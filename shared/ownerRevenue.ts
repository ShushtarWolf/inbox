import { isUnpaidPaymentStatus } from './bookingPayment.ts'

/**
 * Collected revenue split by money rail (dual-rail model).
 * - cash: desk till (method CASH) — never in platform wallets
 * - online: SEP IPG (method IPG) + athlete wallet (method PAID) — settles to club/coach wallet after commission
 *
 * Only Payment.status === 'PAID' counts. REFUNDED and unpaid never count.
 * A cancelled booking whose payment stayed PAID (athlete cancelled inside the window) is money kept.
 */

export type RevenueRail = 'cash' | 'online'

export function paymentRail(method: string | null | undefined): RevenueRail | null {
  if (method === 'CASH') return 'cash'
  if (method === 'IPG' || method === 'PAID') return 'online'
  return null
}

export type RevenueRow = {
  /** Payment.amount — never a list-price fallback (series siblings and comps are 0). */
  amount: number | null | undefined
  method: string | null | undefined
  status: string | null | undefined
  bookingStatus?: string | null
}

export type RevenueSummary = {
  cash: number
  online: number
  total: number
  /** Subset of total from cancelled bookings whose payment was not refunded. */
  keptOnCancel: number
}

export function collectedRail(row: RevenueRow): RevenueRail | null {
  if (row.status !== 'PAID') return null
  return paymentRail(row.method)
}

/**
 * Distinct charged checkout — season/comp siblings stay status PAID at amount 0
 * and must not inflate paymentBreakdown / paidRate / funnel.paid.
 * Revenue sums still use raw payment.amount (0 siblings add nothing).
 */
export function isChargedPaidCheckout(
  amount: number | null | undefined,
  status: string | null | undefined,
): boolean {
  if (status !== 'PAID') return false
  const n = Number(amount)
  return Number.isFinite(n) && n > 0
}

export function summarizeCollectedRevenue(rows: RevenueRow[]): RevenueSummary {
  const out: RevenueSummary = { cash: 0, online: 0, total: 0, keptOnCancel: 0 }
  for (const row of rows) {
    const rail = collectedRail(row)
    if (!rail) continue
    const amount = Number.isFinite(row.amount) ? Math.max(0, Number(row.amount)) : 0
    out[rail] += amount
    out.total += amount
    if (row.bookingStatus === 'CANCELLED') out.keptOnCancel += amount
  }
  return out
}

export type PaymentMethodBreakdown = {
  PAID_CASH: number
  PAID_IPG: number
  UNPAID: number
  /** Legacy keys kept for older clients / smoke scripts. */
  CASH: number
  IPG: number
  NOT_PAID: number
}

function percentShare(part: number, total: number) {
  return total ? Math.round((part / total) * 100) : 0
}

/**
 * Court booking payment-method mix by checkout count (not amount).
 * Uses charged checkouts only — season siblings at amount 0 are excluded.
 */
export function computePaymentMethodBreakdown(rows: RevenueRow[]): PaymentMethodBreakdown {
  const paymentTotals = { PAID_CASH: 0, PAID_IPG: 0, UNPAID: 0 }
  for (const row of rows) {
    if (row.bookingStatus === 'CANCELLED') continue
    const status = row.status || ''
    if (isUnpaidPaymentStatus(status)) {
      paymentTotals.UNPAID += 1
      continue
    }
    if (!isChargedPaidCheckout(row.amount, status)) continue
    const rail = paymentRail(row.method)
    if (rail === 'online') paymentTotals.PAID_IPG += 1
    else if (rail === 'cash') paymentTotals.PAID_CASH += 1
  }
  const paymentCount = paymentTotals.PAID_CASH + paymentTotals.PAID_IPG + paymentTotals.UNPAID
  const paidCash = percentShare(paymentTotals.PAID_CASH, paymentCount)
  const paidIpg = percentShare(paymentTotals.PAID_IPG, paymentCount)
  const unpaid = percentShare(paymentTotals.UNPAID, paymentCount)
  return {
    PAID_CASH: paidCash,
    PAID_IPG: paidIpg,
    UNPAID: unpaid,
    CASH: paidCash,
    IPG: paidIpg,
    NOT_PAID: unpaid,
  }
}
