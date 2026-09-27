import { describe, expect, it } from 'vitest'
import { selectFinanceTransactions, type FinanceTxTimes } from './financeTransactions.ts'

const rows: FinanceTxTimes[] = [
  {
    kind: 'court',
    sessionType: 'free',
    reservationLabel: 'زمین ۲',
    guestName: 'علی',
    paymentMethod: 'CASH',
    amount: 20_000,
    reservedAt: '2026-10-12T16:00:00',
    paidAt: '2026-10-11T09:00:00',
  },
  {
    kind: 'court',
    sessionType: 'coach',
    reservationLabel: 'زمین ۱',
    guestName: 'سارا',
    paymentMethod: 'CASH',
    amount: 10_000,
    reservedAt: '2026-10-20T16:00:00',
    paidAt: null,
  },
  {
    kind: 'coach',
    sessionType: 'coach',
    reservationLabel: 'مربی',
    guestName: 'رضا',
    paymentMethod: 'IPG',
    amount: 40_000,
    reservedAt: '2026-10-18T18:00:00',
    paidAt: '2026-10-18T12:00:00',
  },
]

describe('selectFinanceTransactions', () => {
  it('sorts by reservation time newest first', () => {
    const sorted = selectFinanceTransactions(rows)
    expect(sorted.map((tx) => tx.reservedAt)).toEqual([
      '2026-10-20T16:00:00',
      '2026-10-18T18:00:00',
      '2026-10-12T16:00:00',
    ])
  })

  it('keeps unpaid rows when the payment range is empty and drops them when it is set', () => {
    expect(selectFinanceTransactions(rows, { sortKey: 'guest', sortDir: 'asc' })).toHaveLength(3)
    const paid = selectFinanceTransactions(rows, { paidFrom: '2026-10-01', paidTo: '2026-10-31' })
    expect(paid.map((tx) => tx.guestName)).toEqual(['رضا', 'علی'])
  })

  it('filters reservation time and session type together', () => {
    const picked = selectFinanceTransactions(rows, {
      session: 'free',
      reservedFrom: '2026-10-12',
      reservedTo: '2026-10-12',
    })
    expect(picked.map((tx) => tx.guestName)).toEqual(['علی'])
  })

  it('sorts payment time with empty payments last in both directions', () => {
    const desc = selectFinanceTransactions(rows, { sortKey: 'paidAt', sortDir: 'desc' })
    const asc = selectFinanceTransactions(rows, { sortKey: 'paidAt', sortDir: 'asc' })
    expect(desc.map((tx) => tx.paidAt ?? null)).toEqual([
      '2026-10-18T12:00:00',
      '2026-10-11T09:00:00',
      null,
    ])
    expect(asc[asc.length - 1]?.paidAt ?? null).toBeNull()
    expect(asc[0]?.paidAt).toBe('2026-10-11T09:00:00')
  })

  it('sorts income and guest', () => {
    expect(selectFinanceTransactions(rows, { sortKey: 'amount', sortDir: 'asc' }).map((tx) => tx.amount)).toEqual([
      10_000,
      20_000,
      40_000,
    ])
    expect(selectFinanceTransactions(rows, { sortKey: 'guest', sortDir: 'asc' }).map((tx) => tx.guestName)[0]).toBe('رضا')
  })
})
