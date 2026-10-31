import { describe, expect, it, vi } from 'vitest'
import { deleteStaleCancelledBooking, isDetachedCancelledPayment } from './staleBooking'

function makeTx(booking: unknown) {
  return {
    booking: {
      findUnique: vi.fn().mockResolvedValue(booking),
      delete: vi.fn().mockResolvedValue({}),
    },
    payment: { update: vi.fn().mockResolvedValue({}) },
  }
}

const cancelled = {
  id: 'b1',
  status: 'CANCELLED',
  userId: 'u1',
  slot: { date: '2026-11-01', startTime: '18:00', court: { clubId: 'club-1' } },
  payment: { id: 'p1', userId: null, metadataJson: JSON.stringify({ refNum: '9' }) },
}

describe('deleteStaleCancelledBooking', () => {
  it('detaches the payment before deleting so money history survives the cascade', async () => {
    const tx = makeTx(cancelled)
    await deleteStaleCancelledBooking(tx as never, 'b1')
    expect(tx.payment.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'p1' },
      data: expect.objectContaining({
        bookingId: null,
        userId: 'u1',
        metadataJson: expect.stringContaining('"detachedFromBookingId":"b1"'),
      }),
    }))
    const updateOrder = tx.payment.update.mock.invocationCallOrder[0]!
    const deleteOrder = tx.booking.delete.mock.invocationCallOrder[0]!
    expect(updateOrder).toBeLessThan(deleteOrder)
  })

  it('refuses to delete an active booking', async () => {
    const tx = makeTx({ ...cancelled, status: 'CONFIRMED' })
    await expect(deleteStaleCancelledBooking(tx as never, 'b1')).rejects.toMatchObject({ statusCode: 409 })
    expect(tx.booking.delete).not.toHaveBeenCalled()
  })

  it('flags detached payments for late-callback refund', () => {
    expect(isDetachedCancelledPayment({ bookingId: null, metadataJson: '{"detachedFromBookingId":"b1"}' })).toBe(true)
    expect(isDetachedCancelledPayment({ bookingId: 'b2', metadataJson: '{"detachedFromBookingId":"b1"}' })).toBe(false)
  })
})
