import { describe, expect, it } from 'vitest'
import { paymentRail, summarizeCollectedRevenue } from './ownerRevenue.ts'

describe('ownerRevenue', () => {
  it('treats athlete wallet (method PAID) as online, not desk cash', () => {
    expect(paymentRail('CASH')).toBe('cash')
    expect(paymentRail('IPG')).toBe('online')
    expect(paymentRail('PAID')).toBe('online')
    expect(paymentRail('NOT_PAID')).toBeNull()
  })

  it('splits rails and drops refunded / unpaid rows', () => {
    const summary = summarizeCollectedRevenue([
      { amount: 300_000, method: 'CASH', status: 'PAID' },
      { amount: 500_000, method: 'IPG', status: 'PAID' },
      { amount: 200_000, method: 'PAID', status: 'PAID' },
      { amount: 400_000, method: 'IPG', status: 'REFUNDED', bookingStatus: 'CANCELLED' },
      { amount: 250_000, method: 'CASH', status: 'PAY_AT_CLUB' },
    ])
    expect(summary).toEqual({ cash: 300_000, online: 700_000, total: 1_000_000, keptOnCancel: 0 })
  })

  it('counts money kept on an in-window cancel, and never list-price fallbacks', () => {
    const summary = summarizeCollectedRevenue([
      { amount: 400_000, method: 'IPG', status: 'PAID', bookingStatus: 'CANCELLED' },
      { amount: 0, method: 'CASH', status: 'PAID' },
    ])
    expect(summary).toEqual({ cash: 0, online: 400_000, total: 400_000, keptOnCancel: 400_000 })
  })
})
