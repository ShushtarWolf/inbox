import { isPaidPaymentStatus, isUnpaidPaymentStatus } from './bookingPayment.ts'

export type AthletePayStatusFilter = 'all' | 'paid' | 'unpaid'
export type AthletePayMethodFilter = 'all' | 'cash' | 'ipg' | 'wallet'
export type AthletePaySortKey = 'date' | 'amount' | 'status'
export type AthletePaySortDir = 'asc' | 'desc'

export type AthletePaymentRow = {
  id: string
  status: string
  method: string
  date?: string | null
  createdAt: string
  amount: number
}

export type AthletePayQuery = {
  status?: AthletePayStatusFilter
  method?: AthletePayMethodFilter
  dateFrom?: string
  dateTo?: string
  sortKey?: AthletePaySortKey
  sortDir?: AthletePaySortDir
}

/** Slot/session day when present; otherwise payment created day (ISO `YYYY-MM-DD`). */
export function athletePaymentSortDate(row: Pick<AthletePaymentRow, 'date' | 'createdAt'>) {
  const raw = row.date || row.createdAt || ''
  return String(raw).slice(0, 10)
}

export function matchesAthletePayStatus(status: string, filter: AthletePayStatusFilter = 'all') {
  if (filter === 'all') return true
  if (filter === 'paid') return isPaidPaymentStatus(status)
  return isUnpaidPaymentStatus(status)
}

export function matchesAthletePayMethod(method: string, filter: AthletePayMethodFilter = 'all') {
  if (filter === 'all') return true
  if (filter === 'cash') return method === 'CASH'
  if (filter === 'ipg') return method === 'IPG'
  if (filter === 'wallet') return method === 'PAID'
  return true
}

function matchesDateRange(isoDay: string, from?: string, to?: string) {
  if (!from && !to) return true
  if (!isoDay) return false
  if (from && isoDay < from) return false
  if (to && isoDay > to) return false
  return true
}

const STATUS_RANK: Record<string, number> = {
  PAID: 0,
  PENDING_ONLINE: 1,
  PENDING_AT_CLUB: 2,
  PAY_AT_CLUB: 3,
  FAILED: 4,
  REFUNDED: 5,
}

function compareRows(
  a: AthletePaymentRow,
  b: AthletePaymentRow,
  sortKey: AthletePaySortKey,
  sortDir: AthletePaySortDir,
) {
  const dir = sortDir === 'asc' ? 1 : -1
  if (sortKey === 'amount') {
    return (a.amount - b.amount) * dir
  }
  if (sortKey === 'status') {
    const av = STATUS_RANK[a.status] ?? 99
    const bv = STATUS_RANK[b.status] ?? 99
    if (av !== bv) return (av - bv) * dir
  }
  const ad = athletePaymentSortDate(a)
  const bd = athletePaymentSortDate(b)
  if (ad !== bd) return (ad < bd ? -1 : 1) * dir
  // Stable tie-break: newer createdAt first when dates match on asc date sort reverse of desc.
  if (a.createdAt !== b.createdAt) {
    return (a.createdAt < b.createdAt ? -1 : 1) * dir
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** Client-side filter + sort for athlete payment history. */
export function selectAthletePayments<T extends AthletePaymentRow>(
  rows: T[],
  query: AthletePayQuery = {},
): T[] {
  const status = query.status || 'all'
  const method = query.method || 'all'
  const sortKey = query.sortKey || 'date'
  const sortDir = query.sortDir || 'desc'
  const filtered = rows.filter((row) => (
    matchesAthletePayStatus(row.status, status)
    && matchesAthletePayMethod(row.method, method)
    && matchesDateRange(athletePaymentSortDate(row), query.dateFrom, query.dateTo)
  ))
  return [...filtered].sort((a, b) => compareRows(a, b, sortKey, sortDir))
}
