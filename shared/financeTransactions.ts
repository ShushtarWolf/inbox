export type FinanceSessionFilter = 'all' | 'free' | 'coach'

export type FinanceTxSortKey = 'reservation' | 'reservedAt' | 'paidAt' | 'guest' | 'method' | 'amount'

export type FinanceTxSortDir = 'asc' | 'desc'

export type FinanceTxTimes = {
  kind?: string | null
  sessionType?: string | null
  reservationLabel: string
  guestName: string
  paymentMethod?: string | null
  amount: number
  /** Club-local `YYYY-MM-DDTHH:mm:ss` for the slot or lesson start. */
  reservedAt: string
  /** Club-local stamp when the payment is PAID; empty when unpaid. */
  paidAt?: string | null
}

export type FinanceTxQuery = {
  hideCoach?: boolean
  session?: FinanceSessionFilter
  reservedFrom?: string
  reservedTo?: string
  paidFrom?: string
  paidTo?: string
  sortKey?: FinanceTxSortKey
  sortDir?: FinanceTxSortDir
}

export function isCoachFinanceTx(tx: { kind?: string | null; sessionType?: string | null }) {
  return tx.kind === 'coach' || tx.sessionType === 'coach'
}

function datePart(value: string | null | undefined) {
  return (value || '').slice(0, 10)
}

function inRange(day: string, from: string, to: string) {
  if (!day) return false
  if (from && day < from) return false
  if (to && day > to) return false
  return true
}

function textCmp(a: string, b: string) {
  return a.localeCompare(b, 'fa')
}

/** Null payment times stay at the bottom in both directions. */
function paidCmp(a: string | null | undefined, b: string | null | undefined, dir: FinanceTxSortDir) {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  const cmp = a < b ? -1 : a > b ? 1 : 0
  return dir === 'asc' ? cmp : -cmp
}

function compareTx(a: FinanceTxTimes, b: FinanceTxTimes, key: FinanceTxSortKey, dir: FinanceTxSortDir) {
  if (key === 'paidAt') return paidCmp(a.paidAt, b.paidAt, dir)
  const sign = dir === 'asc' ? 1 : -1
  if (key === 'amount') return (a.amount - b.amount) * sign
  if (key === 'reservedAt') {
    const cmp = a.reservedAt < b.reservedAt ? -1 : a.reservedAt > b.reservedAt ? 1 : 0
    return cmp * sign
  }
  if (key === 'guest') return textCmp(a.guestName || '', b.guestName || '') * sign
  if (key === 'method') return textCmp(a.paymentMethod || '', b.paymentMethod || '') * sign
  return textCmp(a.reservationLabel || '', b.reservationLabel || '') * sign
}

export function selectFinanceTransactions<T extends FinanceTxTimes>(rows: T[], query: FinanceTxQuery = {}): T[] {
  const session = query.session || 'all'
  const reservedFrom = query.reservedFrom || ''
  const reservedTo = query.reservedTo || ''
  const paidFrom = query.paidFrom || ''
  const paidTo = query.paidTo || ''
  const sortKey = query.sortKey || 'reservedAt'
  const sortDir = query.sortDir || 'desc'
  const filtered = rows.filter((tx) => {
    if (query.hideCoach && tx.kind === 'coach') return false
    if (!query.hideCoach && session !== 'all') {
      const coach = isCoachFinanceTx(tx)
      if (session === 'coach' ? !coach : coach) return false
    }
    if ((reservedFrom || reservedTo) && !inRange(datePart(tx.reservedAt), reservedFrom, reservedTo)) return false
    if (paidFrom || paidTo) {
      if (!tx.paidAt) return false
      if (!inRange(datePart(tx.paidAt), paidFrom, paidTo)) return false
    }
    return true
  })
  return filtered.sort((a, b) => {
    const cmp = compareTx(a, b, sortKey, sortDir)
    if (cmp !== 0) return cmp
    return a.reservedAt < b.reservedAt ? 1 : a.reservedAt > b.reservedAt ? -1 : 0
  })
}
