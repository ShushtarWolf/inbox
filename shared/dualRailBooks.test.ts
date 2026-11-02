import { describe, expect, it } from 'vitest'
import { summarizeAthleteCashDesk, summarizeCashBook, summarizeOnlineOpen } from './dualRailBooks.ts'

describe('summarizeCashBook', () => {
  it('splits till, owed returns, and returned cash', () => {
    const book = summarizeCashBook([
      { amount: 500_000, method: 'CASH', status: 'PAID' },
      { amount: 200_000, method: 'CASH', status: 'REFUNDED', metadataJson: '{"deskCashReturn":"owed"}' },
      { amount: 100_000, method: 'CASH', status: 'REFUNDED', metadataJson: '{"deskCashReturn":"returned"}' },
      { amount: 900_000, method: 'IPG', status: 'PAID' },
      { amount: 50_000, method: 'CASH', status: 'PAY_AT_CLUB' },
    ])
    expect(book).toEqual({
      inTill: 500_000,
      returnsOwed: 200_000,
      returnsOwedCount: 1,
      returnsReturned: 100_000,
      returnsReturnedCount: 1,
    })
  })
})

describe('summarizeOnlineOpen', () => {
  it('counts only PAID IPG and wallet methods', () => {
    expect(summarizeOnlineOpen([
      { amount: 300_000, method: 'IPG', status: 'PAID' },
      { amount: 100_000, method: 'PAID', status: 'PAID' },
      { amount: 50_000, method: 'CASH', status: 'PAID' },
      { amount: 20_000, method: 'IPG', status: 'REFUNDED' },
    ]).collectedOpen).toBe(400_000)
  })
})

describe('summarizeAthleteCashDesk', () => {
  it('exposes recent cash rows without mixing online', () => {
    const desk = summarizeAthleteCashDesk([
      {
        id: 'p1',
        amount: 400_000,
        method: 'CASH',
        status: 'REFUNDED',
        metadataJson: '{"deskCashReturn":"owed"}',
        clubName: 'بهناز',
        date: '2026-11-01',
        startTime: '10:00',
        title: 'زمین ۱',
      },
      {
        id: 'p2',
        amount: 700_000,
        method: 'IPG',
        status: 'PAID',
        clubName: 'بهناز',
      },
    ])
    expect(desk.returnsOwed).toBe(400_000)
    expect(desk.inTill).toBe(0)
    expect(desk.recent).toHaveLength(1)
    expect(desk.recent[0]?.deskCashReturn).toBe('owed')
  })
})
