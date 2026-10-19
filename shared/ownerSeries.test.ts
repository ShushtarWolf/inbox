import { describe, expect, it } from 'vitest'
import { ownerSeriesKey, seasonBookingIdNeedle, seriesCancelPaymentId, isSeriesDeskPaymentTarget } from './ownerSeries'

describe('ownerSeriesKey', () => {
  it('prefers a class-package draft over season metadata', () => {
    expect(ownerSeriesKey({
      packageDraftId: 'pkg-1',
      eventMetadataJson: [JSON.stringify({ seasonBookingId: 'season-1' })],
    })).toEqual({ kind: 'package', id: 'pkg-1' })
  })

  it('reads the season id from the create event', () => {
    expect(ownerSeriesKey({
      eventMetadataJson: [JSON.stringify({
        source: 'owner-recurring',
        seasonBookingId: 'season-9',
      })],
    })).toEqual({ kind: 'season', id: 'season-9' })
  })

  it('reads the season id from payment metadata when the event is missing', () => {
    expect(ownerSeriesKey({
      paymentMetadataJson: JSON.stringify({ seasonBookingId: 'season-2', coveredByBookingId: 'b1' }),
    })).toEqual({ kind: 'season', id: 'season-2' })
  })

  it('is null for a one-off desk booking', () => {
    expect(ownerSeriesKey({
      eventMetadataJson: [JSON.stringify({ source: 'owner-calendar' })],
    })).toBeNull()
  })
})

describe('seasonBookingIdNeedle', () => {
  it('matches the fragment JSON.stringify writes and not a longer id', () => {
    const id = 'clseason1'
    const stored = JSON.stringify({ source: 'owner-recurring', seasonBookingId: id, isPrimary: true })
    const needle = seasonBookingIdNeedle(id)
    expect(stored).toContain(needle)
    expect(JSON.stringify({ seasonBookingId: `${id}x` })).not.toContain(needle)
  })
})

describe('seriesCancelPaymentId', () => {
  it('skips a zero-amount covered sibling and keeps a real charge', () => {
    expect(seriesCancelPaymentId({
      id: 'pay-sib',
      amount: 0,
      metadataJson: JSON.stringify({ coveredByBookingId: 'b-primary' }),
    })).toBeNull()
    expect(seriesCancelPaymentId({
      id: 'pay-primary',
      amount: 120000,
      metadataJson: JSON.stringify({ seasonBookingId: 's1', groupSiblingBookingIds: ['b2'] }),
    })).toBe('pay-primary')
    expect(seriesCancelPaymentId({
      id: 'pay-cash',
      amount: 40000,
      metadataJson: JSON.stringify({ coveredByBookingId: 'b-primary', sessionPrice: 40000 }),
    })).toBe('pay-cash')
  })
})

describe('isSeriesDeskPaymentTarget', () => {
  const rows = [
    { id: 'unpaid', paymentStatus: 'PAY_AT_CLUB', payment: { status: 'PAY_AT_CLUB', method: 'CASH' } },
    { id: 'online-pending', paymentStatus: 'PENDING_ONLINE', payment: { status: 'PENDING_ONLINE', method: 'IPG' } },
    { id: 'cash-paid', paymentStatus: 'PAID', payment: { status: 'PAID', method: 'CASH' } },
    { id: 'ipg-paid', paymentStatus: 'PAID', payment: { status: 'PAID', method: 'IPG' } },
    { id: 'no-payment-row', paymentStatus: 'PAY_AT_CLUB', payment: null },
  ]

  it('marks every unpaid session paid', () => {
    expect(rows.filter((row) => isSeriesDeskPaymentTarget(row, 'PAID')).map((row) => row.id))
      .toEqual(['unpaid', 'online-pending', 'no-payment-row'])
  })

  it('only reverses desk cash, never online payments', () => {
    expect(rows.filter((row) => isSeriesDeskPaymentTarget(row, 'PAY_AT_CLUB')).map((row) => row.id))
      .toEqual(['cash-paid'])
  })
})
