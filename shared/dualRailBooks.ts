/**
 * Dual-rail accounting books (cash till vs online float).
 * Cash never enters ClubWallet / athlete Wallet. Online cancel moves club → athlete wallet.
 */
import { paymentRail, type RevenueRail } from './ownerRevenue.ts'
import { parsePaymentMetadata, readDeskCashReturn, type DeskCashReturn } from './cancelRefund.ts'

export type CashBookRow = {
  amount: number | null | undefined
  method: string | null | undefined
  status: string | null | undefined
  metadataJson?: string | null
}

export type CashBookSummary = {
  /** PAID desk cash still held in the club till. */
  inTill: number
  /** Cancelled desk cash awaiting physical handback. */
  returnsOwed: number
  returnsOwedCount: number
  /** Cancelled desk cash already handed back (ack). */
  returnsReturned: number
  returnsReturnedCount: number
}

export type OnlineBookSummary = {
  /** Currently PAID online (IPG + wallet method PAID) — gross collected still on books. */
  collectedOpen: number
}

export function summarizeCashBook(rows: CashBookRow[]): CashBookSummary {
  const out: CashBookSummary = {
    inTill: 0,
    returnsOwed: 0,
    returnsOwedCount: 0,
    returnsReturned: 0,
    returnsReturnedCount: 0,
  }
  for (const row of rows) {
    if (paymentRail(row.method) !== 'cash') continue
    const amount = Number.isFinite(row.amount) ? Math.max(0, Number(row.amount)) : 0
    if (row.status === 'PAID') {
      out.inTill += amount
      continue
    }
    if (row.status !== 'REFUNDED') continue
    const desk = readDeskCashReturn(parsePaymentMetadata(row.metadataJson))
    if (desk === 'owed') {
      out.returnsOwed += amount
      out.returnsOwedCount += 1
    } else if (desk === 'returned') {
      out.returnsReturned += amount
      out.returnsReturnedCount += 1
    }
  }
  return out
}

export function summarizeOnlineOpen(rows: CashBookRow[]): OnlineBookSummary {
  let collectedOpen = 0
  for (const row of rows) {
    if (row.status !== 'PAID') continue
    if (paymentRail(row.method) !== 'online') continue
    const amount = Number.isFinite(row.amount) ? Math.max(0, Number(row.amount)) : 0
    collectedOpen += amount
  }
  return { collectedOpen }
}

export type AthleteCashDeskRow = CashBookRow & {
  id: string
  clubName?: string | null
  date?: string | null
  startTime?: string | null
  title?: string | null
}

export type AthleteCashDeskSummary = CashBookSummary & {
  recent: Array<{
    id: string
    amount: number
    status: string
    deskCashReturn: DeskCashReturn | null
    clubName: string | null
    date: string | null
    startTime: string | null
    title: string | null
  }>
}

export function summarizeAthleteCashDesk(rows: AthleteCashDeskRow[], recentLimit = 20): AthleteCashDeskSummary {
  const book = summarizeCashBook(rows)
  const recent = rows
    .filter((row) => paymentRail(row.method) === 'cash')
    .slice(0, recentLimit)
    .map((row) => {
      const amount = Number.isFinite(row.amount) ? Math.max(0, Number(row.amount)) : 0
      const desk = row.status === 'REFUNDED'
        ? readDeskCashReturn(parsePaymentMetadata(row.metadataJson))
        : null
      return {
        id: row.id,
        amount,
        status: String(row.status || ''),
        deskCashReturn: desk,
        clubName: row.clubName || null,
        date: row.date || null,
        startTime: row.startTime || null,
        title: row.title || null,
      }
    })
  return { ...book, recent }
}

export function railOfPaymentMethod(method: string | null | undefined): RevenueRail | null {
  return paymentRail(method)
}
