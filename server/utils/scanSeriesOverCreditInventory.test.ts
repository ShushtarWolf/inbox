import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findManyPayment: vi.fn(),
  findManyBooking: vi.fn(),
  aggregateWallet: vi.fn(),
  findFirstWallet: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: {
    payment: { findMany: mocks.findManyPayment },
    booking: { findMany: mocks.findManyBooking },
    walletTransaction: {
      aggregate: mocks.aggregateWallet,
      findFirst: mocks.findFirstWallet,
    },
  },
}))

import { scanSeriesOverCreditInventory } from './scanSeriesOverCreditInventory.ts'

const seriesMeta = JSON.stringify({
  groupPrimaryBookingId: 'b-primary',
  groupSiblingBookingIds: ['b2', 'b3'],
  sessionPrice: 5000,
  seasonBookingId: 's1',
})

describe('scanSeriesOverCreditInventory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findFirstWallet.mockResolvedValue(null)
  })

  it('reports over-credit for cancelled series with excess REFUND_CREDIT', async () => {
    mocks.findManyPayment.mockResolvedValue([{
      id: 'pay1',
      amount: 9000,
      userId: 'u1',
      bookingId: 'b-primary',
      metadataJson: seriesMeta,
      booking: { userId: 'u1' },
    }])
    mocks.findManyBooking.mockResolvedValue([
      { id: 'b-primary', status: 'CANCELLED', cancelledAt: new Date('2026-01-01'), userId: 'u1' },
      { id: 'b2', status: 'CANCELLED', cancelledAt: new Date('2026-01-02'), userId: 'u1' },
      { id: 'b3', status: 'CONFIRMED', cancelledAt: null, userId: 'u1' },
    ])
    mocks.aggregateWallet.mockResolvedValue({ _sum: { amount: 5800 } })

    const result = await scanSeriesOverCreditInventory({ limit: 50, onlyOver: true })
    expect(result.withCancels).toBe(1)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({
      paymentId: 'pay1',
      athleteUserId: 'u1',
      charged: 9000,
      credited: 5800,
      fairShare: 3000,
      overCredit: 2800,
      alreadyAdjusted: false,
    })
  })

  it('omits zero-over rows when onlyOver is true', async () => {
    mocks.findManyPayment.mockResolvedValue([{
      id: 'pay2',
      amount: 9000,
      userId: 'u2',
      bookingId: 'b-primary',
      metadataJson: seriesMeta,
      booking: null,
    }])
    mocks.findManyBooking.mockResolvedValue([
      { id: 'b-primary', status: 'CANCELLED', cancelledAt: new Date(), userId: 'u2' },
      { id: 'b2', status: 'CONFIRMED', cancelledAt: null, userId: 'u2' },
      { id: 'b3', status: 'CONFIRMED', cancelledAt: null, userId: 'u2' },
    ])
    mocks.aggregateWallet.mockResolvedValue({ _sum: { amount: 1500 } })

    const result = await scanSeriesOverCreditInventory({ onlyOver: true })
    expect(result.rows).toHaveLength(0)
    expect(result.withCancels).toBe(1)
  })
})