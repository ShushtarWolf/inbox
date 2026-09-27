export type FinanceSessionFilter = 'all' | 'free' | 'coach'

export type FinanceBookingKind = 'normal' | 'package' | 'coach'

export type FinanceBookingKindFilter = 'all' | FinanceBookingKind

export type FinancePaymentFilter = 'all' | 'cash' | 'ipg' | 'unpaid'

export type FinanceTxSortKey = 'reservation' | 'reservedAt' | 'paidAt' | 'guest' | 'method' | 'amount'

export type FinanceTxSortDir = 'asc' | 'desc'

export type FinanceTxTimes = {
  kind?: string | null
  sessionType?: string | null
  bookingKind?: FinanceBookingKind | string | null
  reservationLabel: string
  guestName: string
  guestMobile?: string | null
  paymentMethod?: string | null
  unpaid?: boolean
  amount: number
  /** Club-local `YYYY-MM-DDTHH:mm:ss` for the slot or lesson start. */
  reservedAt: string
  /** Club-local stamp when the payment is PAID; empty when unpaid. */
  paidAt?: string | null
}

export type FinanceTxQuery = {
  hideCoach?: boolean
  session?: FinanceSessionFilter
  bookingKind?: FinanceBookingKindFilter
  payment?: FinancePaymentFilter
  /** Guest name or phone. Persian and Arabic digits count as the same phone. */
  guest?: string
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

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'

function latinDigits(value: string) {
  return value.replace(/[۰-۹٠-٩]/g, (ch) => {
    const fa = PERSIAN_DIGITS.indexOf(ch)
    if (fa >= 0) return String(fa)
    const ar = ARABIC_DIGITS.indexOf(ch)
    return ar >= 0 ? String(ar) : ch
  })
}

export function financePaymentBucket(tx: { paymentMethod?: string | null; unpaid?: boolean }): 'cash' | 'ipg' | 'unpaid' {
  if (tx.unpaid) return 'unpaid'
  if (tx.paymentMethod === 'IPG') return 'ipg'
  if (tx.paymentMethod === 'CASH' || tx.paymentMethod === 'PAID') return 'cash'
  return 'unpaid'
}

export function financeBookingKindOf(tx: {
  bookingKind?: string | null
  kind?: string | null
  sessionType?: string | null
}): FinanceBookingKind {
  if (tx.bookingKind === 'package' || tx.bookingKind === 'coach' || tx.bookingKind === 'normal') return tx.bookingKind
  if (isCoachFinanceTx(tx)) return 'coach'
  return 'normal'
}

function guestMatches(tx: FinanceTxTimes, raw: string) {
  const query = raw.trim()
  if (!query) return true
  const name = (tx.guestName || '').toLocaleLowerCase('fa')
  if (name.includes(query.toLocaleLowerCase('fa'))) return true
  const qDigits = latinDigits(query).replace(/\D/g, '')
  if (!qDigits) return false
  const phone = latinDigits(tx.guestMobile || '').replace(/\D/g, '')
  return phone.includes(qDigits)
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
  const bookingKind = query.bookingKind || 'all'
  const payment = query.payment || 'all'
  const guest = query.guest || ''
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
    if (bookingKind !== 'all' && financeBookingKindOf(tx) !== bookingKind) return false
    if (payment !== 'all' && financePaymentBucket(tx) !== payment) return false
    if (guest && !guestMatches(tx, guest)) return false
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
