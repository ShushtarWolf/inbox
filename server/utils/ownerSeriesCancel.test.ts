import { describe, expect, it, vi, beforeEach } from 'vitest'

const cancelCourtBooking = vi.fn()
const refundAfterSeriesSessionCancel = vi.fn()
const bookingLooksLikeSeriesPayment = vi.fn()

vi.mock('./cancellations', () => ({
  cancelCourtBooking: (...args: unknown[]) => cancelCourtBooking(...args),
}))

vi.mock('./seriesCancelRefund', () => ({
  bookingLooksLikeSeriesPayment: (...args: unknown[]) => bookingLooksLikeSeriesPayment(...args),
  refundAfterSeriesSessionCancel: (...args: unknown[]) => refundAfterSeriesSessionCancel(...args),
}))

import {
  cancelOwnerSeriesBookings,
  partitionOwnerSeriesBySlotStart,
} from './ownerSeriesCancel'

const now = new Date('2026-10-31T12:00:00+03:30')

function row(id: string, date: string, startTime: string, metadataJson?: string) {
  return {
    id,
    slotId: `slot-${id}`,
    userId: 'user-1',
    slot: { date, startTime, endTime: '16:00', courtId: 'court-1' },
    payment: metadataJson
      ? { id: `pay-${id}`, amount: id === 'b1' ? 50_000 : 0, status: 'PAID', metadataJson }
      : null,
  }
}

describe('partitionOwnerSeriesBySlotStart', () => {
  it('keeps past sessions and only returns future slots for cancel', () => {
    const rows = [
      row('b1', '2026-10-21', '15:00'),
      row('b2', '2026-10-28', '15:00'),
      row('b3', '2026-11-04', '15:00'),
    ]
    const { future, skippedPast } = partitionOwnerSeriesBySlotStart(rows, now)
    expect(skippedPast.map((r) => r.id)).toEqual(['b1', 'b2'])
    expect(future.map((r) => r.id)).toEqual(['b3'])
  })

  it('treats same-day slot before now as past', () => {
    const { future, skippedPast } = partitionOwnerSeriesBySlotStart(
      [row('b1', '2026-10-31', '10:00')],
      now,
    )
    expect(skippedPast).toHaveLength(1)
    expect(future).toHaveLength(0)
  })
})

describe('cancelOwnerSeriesBookings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cancelCourtBooking.mockResolvedValue({ ok: true, refund: null, refundFailed: false })
    bookingLooksLikeSeriesPayment.mockReturnValue(true)
    refundAfterSeriesSessionCancel.mockResolvedValue({ refunded: true, walletCredited: true, amount: 5000 })
  })

  it('does not cancel past sessions and pro-rata refunds each future session', async () => {
    const meta = JSON.stringify({
      seasonBookingId: 's1',
      groupPrimaryBookingId: 'b1',
      groupSiblingBookingIds: ['b2', 'b3'],
      sessionPrice: 5000,
    })
    const rows = [
      row('b1', '2026-10-21', '15:00', meta),
      row('b2', '2026-10-28', '15:00', meta),
      row('b3', '2026-11-04', '15:00', meta),
    ]

    const result = await cancelOwnerSeriesBookings({
      rows,
      reason: 'owner-cancel-series',
      now,
    })

    expect(result.skippedPast).toBe(2)
    expect(result.cancelled).toBe(1)
    expect(result.cancelledBookingIds).toEqual(['b3'])
    expect(cancelCourtBooking).toHaveBeenCalledTimes(1)
    expect(cancelCourtBooking).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: 'b3', paymentId: null }),
    )
    expect(refundAfterSeriesSessionCancel).toHaveBeenCalledTimes(1)
    expect(refundAfterSeriesSessionCancel).toHaveBeenCalledWith(
      expect.objectContaining({ cancelledBookingId: 'b3' }),
    )
    expect(result.refundTotal).toBe(5000)
  })

  it('refunds each future session when cancelling a full future-only series', async () => {
    const meta = JSON.stringify({ seasonBookingId: 's1', sessionPrice: 5000 })
    const rows = [
      row('b1', '2026-11-04', '15:00', meta),
      row('b2', '2026-11-11', '15:00', meta),
    ]
    refundAfterSeriesSessionCancel
      .mockResolvedValueOnce({ refunded: true, walletCredited: true, amount: 5000 })
      .mockResolvedValueOnce({ refunded: true, walletCredited: true, amount: 5000 })

    const result = await cancelOwnerSeriesBookings({
      rows,
      reason: 'owner-cancel-series',
      now,
    })

    expect(result.skippedPast).toBe(0)
    expect(result.cancelled).toBe(2)
    expect(cancelCourtBooking).toHaveBeenCalledTimes(2)
    expect(refundAfterSeriesSessionCancel).toHaveBeenCalledTimes(2)
    expect(result.refundTotal).toBe(10_000)
  })
})
