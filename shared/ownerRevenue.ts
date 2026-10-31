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
