import { describe, expect, it } from 'vitest'
import {
  defaultAthleteSeasonFinishDate,
  expandAthleteWeeklySeason,
  isAthleteSeasonEnabled,
  isSeasonPaymentSeries,
  isSeriesPaymentGroup,
  MAX_ATHLETE_SEASON_OCCURRENCES,
  parseSeriesPaymentMeta,
  athleteListPrice,
  receiptLinePrice,
  sessionRefundAmount,
} from './athleteSeason'

describe('isAthleteSeasonEnabled', () => {
  it('defaults off', () => {
    expect(isAthleteSeasonEnabled({ env: {} })).toBe(false)
  })

  it('reads ATHLETE_SEASON_ENABLED', () => {
    expect(isAthleteSeasonEnabled({ env: { ATHLETE_SEASON_ENABLED: 'true' } })).toBe(true)
  })

  it('honors explicit enabled', () => {
    expect(isAthleteSeasonEnabled({ enabled: true })).toBe(true)
    expect(isAthleteSeasonEnabled({ enabled: false, env: { ATHLETE_SEASON_ENABLED: 'true' } })).toBe(false)
  })
})

describe('expandAthleteWeeklySeason', () => {
  it('expands one weekday rule and caps at 12', () => {
    const sessions = expandAthleteWeeklySeason({
      startDate: '2026-10-03', // Sat
      finishDate: '2027-12-31',
      rule: {
        weekday: 'Sat',
        startTime: '18:00',
        endTime: '19:00',
        courtId: 'c1',
      },
    })
    expect(sessions.length).toBe(MAX_ATHLETE_SEASON_OCCURRENCES)
    expect(sessions[0]).toEqual({ date: '2026-10-03', startTime: '18:00', courtId: 'c1' })
    expect(sessions.every((s) => s.startTime === '18:00' && s.courtId === 'c1')).toBe(true)
  })

  it('returns fewer than max when range is short', () => {
    const sessions = expandAthleteWeeklySeason({
      startDate: '2026-10-03',
      finishDate: '2026-10-17',
      rule: {
        weekday: 'Sat',
        startTime: '10:00',
        endTime: '11:00',
        courtId: 'c1',
      },
    })
    expect(sessions.map((s) => s.date)).toEqual(['2026-10-03', '2026-10-10', '2026-10-17'])
  })
})

describe('defaultAthleteSeasonFinishDate', () => {
  it('defaults to 4 weekly hits (start + 3 weeks)', () => {
    expect(defaultAthleteSeasonFinishDate('2026-10-03')).toBe('2026-10-24')
  })
})

describe('series payment meta + pro-rata', () => {
  it('parses series metadata', () => {
    const meta = parseSeriesPaymentMeta(JSON.stringify({
      seasonBookingId: 's1',
      coveredByBookingId: 'p1',
      sessionPrice: 100,
    }))
    expect(isSeriesPaymentGroup(meta)).toBe(true)
    expect(meta.sessionPrice).toBe(100)
  })

  it('refunds sessionPrice while residual remains', () => {
    expect(sessionRefundAmount({
      sessionPrice: 200_000,
      primaryAmount: 800_000,
      alreadyRefunded: 0,
    })).toBe(200_000)
    expect(sessionRefundAmount({
      sessionPrice: 200_000,
      primaryAmount: 800_000,
      alreadyRefunded: 700_000,
    })).toBe(100_000)
  })

  it('returns 0 when no sessionPrice', () => {
    expect(sessionRefundAmount({
      sessionPrice: null,
      primaryAmount: 800_000,
      alreadyRefunded: 0,
    })).toBe(0)
  })

  it('treats only seasonBookingId as a season series label', () => {
    expect(isSeasonPaymentSeries({ seasonBookingId: 's1' })).toBe(true)
    expect(isSeasonPaymentSeries({
      groupPrimaryBookingId: 'b1',
      groupSiblingBookingIds: ['b2'],
    })).toBe(false)
    expect(isSeasonPaymentSeries({ coveredByBookingId: 'b1' })).toBe(false)
  })

  it('receipt lines prefer sessionPrice over primary-total / sibling-0', () => {
    expect(receiptLinePrice({
      meta: { sessionPrice: 12_000, groupPrimaryBookingId: 'b1', groupSiblingBookingIds: ['b2'] },
      paymentAmount: 20_000,
      slotPrice: 10_000,
    })).toBe(12_000)
    expect(receiptLinePrice({
      meta: { sessionPrice: 8_000, coveredByBookingId: 'b1' },
      paymentAmount: 0,
      slotPrice: 10_000,
    })).toBe(8_000)
  })

  it('legacy multi-court without sessionPrice falls back to slot price', () => {
    expect(receiptLinePrice({
      meta: { groupPrimaryBookingId: 'b1', groupSiblingBookingIds: ['b2'] },
      paymentAmount: 20_000,
      slotPrice: 12_000,
    })).toBe(12_000)
    expect(receiptLinePrice({
      meta: { coveredByBookingId: 'b1' },
      paymentAmount: 0,
      slotPrice: 8_000,
    })).toBe(8_000)
  })

  it('ungrouped payments still use payment amount', () => {
    expect(receiptLinePrice({
      meta: {},
      paymentAmount: 15_000,
      slotPrice: 12_000,
    })).toBe(15_000)
  })

  it('athleteListPrice keeps charged totals and fills sibling zeros', () => {
    expect(athleteListPrice({
      meta: { sessionPrice: 55_000, groupPrimaryBookingId: 'b1', groupSiblingBookingIds: ['b2'] },
      paymentAmount: 165_000,
      slotPrice: 55_000,
    })).toBe(165_000)
    expect(athleteListPrice({
      meta: { sessionPrice: 55_000, coveredByBookingId: 'b1' },
      paymentAmount: 0,
      slotPrice: 55_000,
    })).toBe(55_000)
    expect(athleteListPrice({
      meta: {},
      paymentAmount: 0,
      slotPrice: 55_000,
    })).toBe(0)
  })
})
