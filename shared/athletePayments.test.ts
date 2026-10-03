import { describe, expect, it } from 'vitest'
import { selectAthletePayments, type AthletePaymentRow } from './athletePayments.ts'

const rows: AthletePaymentRow[] = [
  {
    id: '1',
    status: 'PAID',
    method: 'PAID',
    date: '2026-10-02',
    createdAt: '2026-10-01T10:00:00.000Z',
    amount: 24_000,
  },
  {
    id: '2',
    status: 'FAILED',
    method: 'IPG',
    date: '2026-10-03',
    createdAt: '2026-10-02T10:00:00.000Z',
    amount: 30_000,
  },
  {
    id: '3',
    status: 'PAID',
    method: 'CASH',
    date: null,
    createdAt: '2026-09-20T10:00:00.000Z',
    amount: 10_000,
  },
  {
    id: '4',
    status: 'PENDING_ONLINE',
    method: 'NOT_PAID',
    date: '2026-10-01',
    createdAt: '2026-09-30T10:00:00.000Z',
    amount: 15_000,
  },
]

describe('selectAthletePayments', () => {
  it('filters by paid / unpaid and payment method', () => {
    expect(selectAthletePayments(rows, { status: 'paid' }).map((r) => r.id)).toEqual(['1', '3'])
    expect(selectAthletePayments(rows, { status: 'unpaid' }).map((r) => r.id).sort()).toEqual(['2', '4'])
    expect(selectAthletePayments(rows, { method: 'wallet' }).map((r) => r.id)).toEqual(['1'])
    expect(selectAthletePayments(rows, { method: 'ipg' }).map((r) => r.id)).toEqual(['2'])
    expect(selectAthletePayments(rows, { method: 'cash' }).map((r) => r.id)).toEqual(['3'])
  })

  it('filters by date range using slot date or created day', () => {
    const mid = selectAthletePayments(rows, { dateFrom: '2026-10-01', dateTo: '2026-10-02' })
    expect(mid.map((r) => r.id).sort()).toEqual(['1', '4'])
  })

  it('sorts by date desc by default and by amount when asked', () => {
    expect(selectAthletePayments(rows).map((r) => r.id)).toEqual(['2', '1', '4', '3'])
    expect(selectAthletePayments(rows, { sortKey: 'amount', sortDir: 'asc' }).map((r) => r.id)).toEqual([
      '3',
      '4',
      '1',
      '2',
    ])
  })
})
