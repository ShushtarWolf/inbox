import { describe, expect, it } from 'vitest'
import { computeSeriesCancelOverCredit, seriesOverCreditNote } from './seriesOverCredit.ts'

describe('computeSeriesCancelOverCredit', () => {
  it('Behnaz pack: 9000 / 6 sessions, 2 cancels credited 5800 → over 2800', () => {
    const meta = {
      sessionPrice: 5000,
      seasonBookingId: 'season',
      groupPrimaryBookingId: 'primary',
      groupSiblingBookingIds: ['a', 'b', 'c', 'd', 'e'],
    }
    const result = computeSeriesCancelOverCredit({
      primaryAmount: 9000,
      sessionPrice: 5000,
      totalSessions: 6,
      cancelledCount: 2,
      creditedTotal: 5800,
      metadata: meta,
    })
    expect(result.sessionCredits).toEqual([1500, 1500])
    expect(result.fairOwed).toBe(3000)
    expect(result.over).toBe(2800)
  })

  it('no over when credits match fair share', () => {
    const result = computeSeriesCancelOverCredit({
      primaryAmount: 9000,
      sessionPrice: 5000,
      totalSessions: 6,
      cancelledCount: 2,
      creditedTotal: 3000,
      metadata: { seasonBookingId: 's', sessionPrice: 5000 },
    })
    expect(result.over).toBe(0)
  })

  it('note is stable for idempotency', () => {
    expect(seriesOverCreditNote('pay1')).toBe('recon:series-over-credit:pay1')
  })
})
