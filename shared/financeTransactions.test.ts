import { describe, expect, it } from 'vitest'
import { financeSheetXml } from './financeSpreadsheet.ts'
import { selectFinanceTransactions, type FinanceTxTimes } from './financeTransactions.ts'

const rows: FinanceTxTimes[] = [
  {
    kind: 'court',
    sessionType: 'free',
    reservationLabel: 'زمین ۲',
    guestName: 'علی',
    paymentMethod: 'CASH',
    unpaid: false,
    guestMobile: '09120000001',
    bookingKind: 'normal',
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
    unpaid: true,
    guestMobile: '09120000002',
    bookingKind: 'package',
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
    unpaid: false,
    guestMobile: '09120000003',
    bookingKind: 'coach',
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

  it('filters booking kind, payment method, and guest name or phone', () => {
    expect(selectFinanceTransactions(rows, { bookingKind: 'package' }).map((tx) => tx.guestName)).toEqual(['سارا'])
    expect(selectFinanceTransactions(rows, { payment: 'ipg' }).map((tx) => tx.guestName)).toEqual(['رضا'])
    expect(selectFinanceTransactions(rows, { payment: 'cash' }).map((tx) => tx.guestName)).toEqual(['علی'])
    expect(selectFinanceTransactions(rows, { guest: 'سارا' }).map((tx) => tx.guestName)).toEqual(['سارا'])
    expect(selectFinanceTransactions(rows, { guest: '۰۹۱۲۰۰۰۰۰۰۱' }).map((tx) => tx.guestName)).toEqual(['علی'])
  })

  it('filters by discount code', () => {
    const listed = rows.map((tx, index) => ({ ...tx, discountCode: index === 0 ? 'SAVE10' : null }))
    expect(selectFinanceTransactions(listed, { discountCode: 'save10' }).map((tx) => tx.guestName)).toEqual(['علی'])
    expect(selectFinanceTransactions(listed, { discountCode: 'سیو' })).toHaveLength(0)
  })

  it('writes an excel xml sheet with a numeric amount', () => {
    const xml = financeSheetXml(['مهمان', 'مبلغ'], [['علی & رضا', 20000]])
    expect(xml).toContain('ss:Type="Number">20000')
    expect(xml).toContain('علی &amp; رضا')
    expect(xml).not.toContain('علی & رضا')
  })

  it('filters the same states as the calendar legend', () => {
    const listed: FinanceTxTimes[] = [
      {
        ...rows[0],
        paymentStatus: 'PAID',
        bookingStatus: 'CONFIRMED',
        displayStatus: 'RESERVED',
        comments: 'تماس',
      },
      {
        ...rows[1],
        paymentStatus: 'PAY_AT_CLUB',
        bookingStatus: 'PENDING',
        displayStatus: 'PENDING',
      },
      {
        ...rows[2],
        paymentStatus: 'PAID',
        bookingStatus: 'CONFIRMED',
        displayStatus: 'RESERVED',
        isRecurring: true,
      },
      {
        kind: 'slot',
        reservationLabel: 'زمین ۳',
        guestName: '',
        amount: 0,
        reservedAt: '2026-10-01T08:00:00',
        displayStatus: 'BLOCKED',
        bookingStatus: 'BLOCKED',
      },
      {
        kind: 'slot',
        reservationLabel: 'زمین ۴',
        guestName: '',
        amount: 0,
        reservedAt: '2026-10-02T09:00:00',
        displayStatus: 'FREE',
        bookingStatus: 'FREE',
      },
    ]
    expect(selectFinanceTransactions(listed).some((tx) => tx.kind === 'slot')).toBe(false)
    expect(selectFinanceTransactions(listed, { legend: 'paid' }).map((tx) => tx.guestName)).toEqual(['رضا', 'علی'])
    expect(selectFinanceTransactions(listed, { legend: 'pending' }).map((tx) => tx.guestName)).toEqual(['سارا'])
    expect(selectFinanceTransactions(listed, { legend: 'season' }).map((tx) => tx.guestName)).toEqual(['رضا'])
    expect(selectFinanceTransactions(listed, { legend: 'note' }).map((tx) => tx.guestName)).toEqual(['علی'])
    expect(selectFinanceTransactions(listed, { legend: 'reserved' }).map((tx) => tx.guestName)).toEqual(['رضا', 'علی'])
    expect(selectFinanceTransactions(listed, { legend: 'blocked' }).map((tx) => tx.reservationLabel)).toEqual(['زمین ۳'])
    expect(selectFinanceTransactions(listed, { legend: 'free' }).map((tx) => tx.reservationLabel)).toEqual(['زمین ۴'])
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
