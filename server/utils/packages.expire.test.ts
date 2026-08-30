import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const findManyBookings = vi.fn()
const updateBooking = vi.fn()
const updatePayment = vi.fn()
const transaction = vi.fn()

vi.mock('./prisma', () => ({
  prisma: {
    packageBooking: {
      findMany: (...args: unknown[]) => findManyBookings(...args),
      update: (...args: unknown[]) => updateBooking(...args),
    },
    payment: {
      update: (...args: unknown[]) => updatePayment(...args),
    },
    $transaction: (...args: unknown[]) => transaction(...args),
  },
}))

vi.mock('./refunds', () => ({
  refundPaymentForCancellation: vi.fn(),
}))

vi.mock('./slots', () => ({
  formatHour: (h: number) => `${String(h).padStart(2, '0')}:00`,
  hourEnd: (h: number) => `${String(h + 1).padStart(2, '0')}:00`,
  addMinutes: () => '00:00',
  ensureSlotsForDate: vi.fn(),
}))

vi.mock('./seasonSlots', () => ({
  datesForWeekdaysInRange: () => [],
  hourFromTime: () => 0,
}))

vi.stubGlobal('createError', (input: { statusCode: number; statusMessage: string }) => {
  const err = new Error(input.statusMessage) as Error & { statusCode: number }
  err.statusCode = input.statusCode
  return err
})

import { expireStalePendingPackageBookings } from './packages'

describe('expireStalePendingPackageBookings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    transaction.mockImplementation(async (fn: (tx: {
      packageBooking: { update: typeof updateBooking }
      payment: { update: typeof updatePayment }
    }) => unknown) => fn({
      packageBooking: { update: updateBooking },
      payment: { update: updatePayment },
    }))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('cancels stale online PENDING seats and marks payment FAILED', async () => {
    findManyBookings.mockResolvedValue([
      {
        id: 'pb-1',
        payment: { id: 'pay-1', status: 'PENDING_ONLINE' },
      },
    ])
    updateBooking.mockResolvedValue({})
    updatePayment.mockResolvedValue({})

    const now = new Date('2026-08-30T12:00:00Z')
    const result = await expireStalePendingPackageBookings(now)

    expect(result).toEqual({ expired: 1, scanned: 1 })
    expect(updateBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pb-1' },
        data: expect.objectContaining({
          status: 'CANCELLED',
          cancelledAt: now,
          paymentStatus: 'FAILED',
        }),
      }),
    )
    expect(updatePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pay-1' },
        data: { status: 'FAILED' },
      }),
    )
  })

  it('returns zero when nothing is stale', async () => {
    findManyBookings.mockResolvedValue([])
    const result = await expireStalePendingPackageBookings()
    expect(result).toEqual({ expired: 0, scanned: 0 })
    expect(transaction).not.toHaveBeenCalled()
  })
})
